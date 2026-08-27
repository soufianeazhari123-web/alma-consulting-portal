// One-click owner login (token-protected). Generates a Supabase magic link
// and redirects the browser to it -> user is signed in automatically.
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TOKEN = process.env.FIX_TOKEN || 'ALMA_FIX_2026'

export default async (req) => {
  const u = new URL(req.url)
  if (u.searchParams.get('token') !== TOKEN)
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(SB_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'info@almaconsulting.lt',
    options: { redirectTo: 'https://portal.almaconsulting.lt/' },
  })
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(null, { status: 302, headers: { Location: data.properties.action_link } })
}
