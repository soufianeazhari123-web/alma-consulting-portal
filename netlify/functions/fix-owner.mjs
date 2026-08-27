// One-time owner password fix (token-protected). Uses service role key.
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TOKEN = process.env.FIX_TOKEN || 'ALMA_FIX_2026'

const json = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export default async (req) => {
  const u = new URL(req.url)
  if (u.searchParams.get('token') !== TOKEN) return json(403, { error: 'forbidden' })

  const admin = createClient(SB_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const email = 'info@almaconsulting.lt'
  const password = 'Alma2026!!Secure'

  try {
    const { data: list } = await admin.auth.admin.listUsers()
    const user = (list.users || []).find((x) => x.email === email)
    if (!user) return json(404, { error: 'user_not_found' })

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    })
    if (error) return json(500, { error: error.message })

    // Clear any login lockout
    await admin.rpc('login_reset', { p_email: email })

    return json(200, { ok: true, email, password })
  } catch (e) {
    return json(500, { error: e.message })
  }
}
