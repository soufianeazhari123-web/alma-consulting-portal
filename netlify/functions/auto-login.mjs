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
<body style="font-family:system-ui;padding:40px"><h3>Connexion en cours…</h3><pre id="log" style="background:#f1f5f9;padding:12px;white-space:pre-wrap"></pre><p><a id="go" href="/" style="display:none;padding:10px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">Aller au tableau de bord →</a></p>
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
  if (s.session) {
    log('Cliquez sur le bouton ci-dessous si vous n\\'êtes pas redirigé.')
    const a = document.getElementById('go'); a.style.display='inline-block'
    setTimeout(() => location.href = '/', 1500)
  }
}
<\/script>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
