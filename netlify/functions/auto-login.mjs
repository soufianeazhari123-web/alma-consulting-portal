// One-click auto-login (token-protected). Opens Supabase session then redirects to /.
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const TOKEN = process.env.FIX_TOKEN || 'ALMA_FIX_2026'

export default async (req) => {
  const u = new URL(req.url)
  if (u.searchParams.get('token') !== TOKEN)
    return new Response('forbidden', { status: 403 })

  const html = `<!doctype html>
<meta charset="utf-8"><title>Connexion…</title>
<body style="font-family:system-ui;padding:40px">Connexion en cours…<pre id="log"></pre>
<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const log = (m) => { document.getElementById('log').textContent += m + "\\n"; console.log(m) }
const supabase = createClient(${JSON.stringify(SB_URL)}, ${JSON.stringify(ANON)})
log('Tentative connexion…')
const { data, error } = await supabase.auth.signInWithPassword({ email: 'info@almaconsulting.lt', password: 'Alma2026!!Secure' })
if (error) { log('Erreur signIn: ' + error.message); document.body.style.background='#fee' }
else {
  log('signIn ok: ' + data.user.email)
  const { data: s } = await supabase.auth.getSession()
  log('session: ' + (s.session ? 'présente ('+s.session.user.email+')' : 'absente'))
  log('Redirection vers / dans 1s…')
  setTimeout(() => location.href = '/', 1200)
}
<\/script>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
