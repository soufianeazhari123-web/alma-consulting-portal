import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useLang()
  const [email, setEmail] = useState('info@almaconsulting.lt')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ownerExists, setOwnerExists] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .then(({ count }) => setOwnerExists((count ?? 0) > 0))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await signIn(email, password)
      const { data: prof } = await supabase.from('profiles').select('role,is_active').single()
      window.location.href = prof?.role === 'student' ? '/portal' : '/'
    } catch (ex) {
      setErr(t(ex.message) !== ex.message ? t(ex.message) : ex.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">ALMA CONSULTING</div>
        <div className="auth-sub">{t('login')}</div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">{t('email')}</label>
            <input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">{t('password')}</label>
            <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? '…' : t('signIn')}</button>
        </form>
        {!ownerExists && <p style={{ textAlign: 'center', marginTop: 16 }}><Link to="/setup" className="hint">{t('setupTitle')} →</Link></p>}
      </div>
    </div>
  )
}
