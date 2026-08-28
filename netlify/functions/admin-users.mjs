// ============================================================
// ALMA CONSULTING — Privileged account provisioning (server-side)
// Runs as a Netlify Function holding SUPABASE_SERVICE_ROLE_KEY.
// ============================================================
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SB_URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars')
}

const json = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const rnd = new Uint32Array(12)
  crypto.getRandomValues(rnd)
  for (const r of rnd) out += chars[r % chars.length]
  return out
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const admin = createClient(SB_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'unauthenticated' })
  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData?.user) return json(401, { error: 'unauthenticated' })
  const callerId = userData.user.id

  const { data: caller } = await admin.from('profiles').select('*').eq('id', callerId).single()
  if (!caller || !caller.is_active || !['super_admin', 'director'].includes(caller.role)) {
    return json(403, { error: 'forbidden' })
  }

  let body
  try { body = JSON.parse(await req.text() || '{}') } catch { return json(400, { error: 'bad_json' }) }
  const { action } = body

  const audit = (a, entity, entityId, meta) =>
    admin.from('audit_logs').insert({
      actor_id: callerId, actor_staff_code: caller.staff_code, actor_role: caller.role,
      action: a, entity, entity_id: String(entityId ?? ''), meta: meta ?? {},
    })

  try {
    if (action === 'invite_staff') {
      const { email, full_name, role, agency_id, password: customPw } = body
      if (!['agent', 'director'].includes(role)) return json(400, { error: 'bad_role' })
      if (caller.role === 'director') {
        if (role !== 'agent') return json(403, { error: 'directors_create_agents_only' })
        if (agency_id !== caller.agency_id) return json(403, { error: 'wrong_agency' })
      }
      const { data: agency } = await admin.from('agencies').select('id').eq('id', agency_id).single()
      if (!agency) return json(404, { error: 'agency_not_found' })

      const password = customPw && String(customPw).length >= 8 ? String(customPw) : tempPassword()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name },
      })
      if (cErr) {
        if (String(cErr.message).toLowerCase().includes('already'))
          return json(409, { error: 'email_exists' })
        throw cErr
      }

      const { data: code } = await admin.rpc('next_staff_code')
      await admin.from('profiles').update({
        full_name, role, agency_id, is_active: true,
        staff_code: code || null,
      }).eq('id', created.user.id)

      await audit('staff:invited', 'profiles', created.user.id, { role, agency_id, email })
      return json(200, { profile_id: created.user.id, staff_code: code, temp_password: password })
    }

    if (action === 'invite_student') {
      const { student_id, email } = body
      const { data: st } = await admin.from('students').select('*').eq('id', student_id).single()
      if (!st) return json(404, { error: 'student_not_found' })
      if (caller.role === 'director' && st.agency_id !== caller.agency_id)
        return json(403, { error: 'wrong_agency' })
      if (caller.role === 'agent' && st.main_agent_id !== caller.id)
        return json(403, { error: 'not_main_agent' })
      if (!caller.role || !['super_admin','director','agent'].includes(caller.role))
        return json(403, { error: 'forbidden' })

      const existing = await admin.from('profiles').select('id').eq('student_id', student_id).maybeSingle()
      if (existing.data) return json(409, { error: 'portal_account_exists' })

      const password = tempPassword()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: email || st.email, password, email_confirm: true,
        user_metadata: { full_name: st.full_name },
      })
      if (cErr) {
        if (String(cErr.message).toLowerCase().includes('already'))
          return json(409, { error: 'email_exists' })
        throw cErr
      }
      await admin.from('profiles').update({
        full_name: st.full_name, role: 'student', student_id, is_active: true,
      }).eq('id', created.user.id)

      await audit('student_portal:invited', 'students', student_id, { email: email || st.email })
      return json(200, { profile_id: created.user.id, temp_password: password })
    }

    if (action === 'set_active') {
      const { profile_id, active } = body
      const { data: target } = await admin.from('profiles').select('*').eq('id', profile_id).single()
      if (!target) return json(404, { error: 'profile_not_found' })
      if (target.role === 'super_admin') return json(403, { error: 'cannot_deactivate_owner' })
      if (caller.role === 'director' &&
          !(target.role === 'agent' && target.agency_id === caller.agency_id))
        return json(403, { error: 'forbidden' })

      await admin.from('profiles').update({ is_active: !!active }).eq('id', profile_id)
      await admin.auth.admin.updateUserById(profile_id, { ban_duration: active ? 'none' : '876000h' })
      await audit(active ? 'staff:activated' : 'staff:deactivated', 'profiles', profile_id, {})
      return json(200, { ok: true })
    }

    if (action === 'reset_link') {
      const { profile_id } = body
      const { data: target } = await admin.from('profiles').select('*').eq('id', profile_id).single()
      if (!target) return json(404, { error: 'profile_not_found' })
      if (caller.role === 'director' &&
          !(target.agency_id === caller.agency_id && ['agent','student'].includes(target.role)))
        return json(403, { error: 'forbidden' })

      const { data: link, error: lErr } = await admin.auth.admin.generateLink({
        type: 'recovery', email: target.email,
      })
      if (lErr) throw lErr
      await audit('auth:reset_generated', 'profiles', profile_id, {})
      return json(200, { reset_link: link.properties?.action_link })
    }

    if (action === 'delete_staff') {
      const { profile_id } = body
      if (!is_super_admin()) return json(403, { error: 'forbidden' })
      if (profile_id === callerId) return json(403, { error: 'cannot_delete_self' })
      const { data: target } = await admin.from('profiles').select('*').eq('id', profile_id).single()
      if (!target) return json(404, { error: 'profile_not_found' })
      if (target.role === 'super_admin') return json(403, { error: 'cannot_delete_owner' })
      // Clean up references (service role bypasses RLS)
      await admin.from('students').update({ main_agent_id: null }).eq('main_agent_id', profile_id)
      await admin.from('cases').update({ agent_id: null }).eq('agent_id', profile_id)
      await admin.from('tasks').update({ assignee: null }).eq('assignee', profile_id)
      const { error: dErr } = await admin.auth.admin.deleteUser(profile_id)
      if (dErr) throw dErr
      await audit('staff:deleted', 'profiles', profile_id, { role: target.role, email: target.email })
      return json(200, { ok: true })
    }

    if (action === 'delete_student') {
      const { student_id } = body
      if (!is_super_admin()) return json(403, { error: 'forbidden' })
      const { data: st } = await admin.from('students').select('id, agency_id').eq('id', student_id).single()
      if (!st) return json(404, { error: 'student_not_found' })
      // Delete portal account if exists
      const { data: portal } = await admin.from('profiles').select('id').eq('student_id', student_id).maybeSingle()
      if (portal) await admin.auth.admin.deleteUser(portal.id)
      // Delete related data (service role)
      const { data: caseIds } = await admin.from('cases').select('id').eq('student_id', student_id)
      const cids = (caseIds || []).map(c => c.id)
      if (cids.length) {
        await admin.from('case_documents').delete().in('case_id', cids)
        await admin.from('case_checklist_items').delete().in('case_id', cids)
        await admin.from('cases').delete().in('id', cids)
      }
      await admin.from('invoices').delete().eq('student_id', student_id)
      await admin.from('payments').delete().eq('student_id', student_id)
      await admin.from('messages').delete().eq('student_id', student_id)
      await admin.from('internal_notes').delete().eq('student_id', student_id)
      await admin.from('tasks').delete().eq('student_id', student_id)
      await admin.from('students').delete().eq('id', student_id)
      await audit('student:hard_deleted', 'students', student_id, {})
      return json(200, { ok: true })
    }

    return json(400, { error: 'unknown_action' })
  } catch (e) {
    console.error('admin-users error:', e.message)
    return json(500, { error: 'server_error', detail: e.message })
  }
}
