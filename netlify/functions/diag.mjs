// Diagnostic: reports Netlify <-> Supabase connectivity, auth state, rate-limit
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TOKEN = process.env.FIX_TOKEN || 'ALMA_FIX_2026'

export default async (req) => {
  const u = new URL(req.url)
  if (u.searchParams.get('token') !== TOKEN)
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(SB_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'missing'
  const out = { netlify: 'ok', supabase_url: SB_URL, env: { has_service_key: !!KEY, has_anon_key: anonKey !== 'missing' } }

  try {
    const { data: list } = await admin.auth.admin.listUsers()
    const owner = (list.users || []).find(x => x.email === 'info@almaconsulting.lt')
    out.owner = owner ? {
      id: owner.id,
      email: owner.email,
      email_confirmed_at: owner.email_confirmed_at,
      last_sign_in_at: owner.last_sign_in_at,
      has_password: !!(owner.encrypted_password),
      providers: (owner.identities || []).map(i => i.provider),
    } : 'NOT_FOUND'

    const { data: prof, error: pErr } = await admin.from('profiles').select('id,role,is_active,email,staff_code').eq('id', owner?.id).maybeSingle()
    out.profile = pErr ? { error: pErr.message } : prof

    const { data: ls } = await admin.from('login_security').select('email,failed_count,locked_until').eq('email', 'info@almaconsulting.lt').maybeSingle()
    out.login_security = ls || 'no row'

    // Rate-limit check: try to see if Email provider enabled (via settings is not queryable, so we test by attempting a dry-run signIn)
    // Instead, just report if we can query company_settings/agencies
    const { error: cErr } = await admin.from('agencies').select('id', { count: 'exact', head: true })
    out.db = cErr ? { error: cErr.message } : 'reachable'

    // Check OTP email template / provider naive: if owner exists, try generateLink (does not send email) to see if auth works
    const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'info@almaconsulting.lt', options: { redirectTo: 'https://portal.almaconsulting.lt/' } })
    out.generateLink = glErr ? { error: glErr.message } : 'ok'

  } catch (e) {
    out.exception = e.message
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
