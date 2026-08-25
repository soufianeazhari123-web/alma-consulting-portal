import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ownerExists, setOwnerExists] = useState(true)

  useEffect(() => {
    // Show setup link only before the owner account exists
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .then(({ count }) => setOwnerExists((count ?? 0) > 0))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await signIn(email, password)
      window.location.href = '/'
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">ALMA CONSULTING</div>
        <div className="auth-sub">{t('login')}</div>

        <div className="field">
          <label htmlFor="email">{t('email')}</label>
          <input id="email" type="email" required autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">{t('password')}</label>
          <input id="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="err">{t(err) !== err ? t(err) : err}</p>}
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
          {busy ? '…' : t('signIn')}
        </button>

        {!ownerExists && (
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/setup" className="hint">{t('setupTitle')} →</Link>
          </p>
        )}
      </form>
    </div>
  )
}
