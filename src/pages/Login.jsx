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

  // MFA second step (required for Super Admin/directors, Q13)
  const [mfaFactor, setMfaFactor] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [code, setCode] = useState('')

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
      if (!mfaFactor) {
        await signIn(email, password)

        // Does this account enforce TOTP?
        const { data: mf } = await supabase.auth.mfa.listFactors()
        const verified = (mf?.all ?? []).find((f) => f.status === 'verified')
        if (verified) {
          const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: verified.id })
          if (cErr) throw cErr
          setMfaFactor(verified); setChallengeId(ch.id)
          setBusy(false); return
        }
      } else {
        const { error: vErr } = await supabase.auth.mfa.verify({
          factorId: mfaFactor.id, challengeId, code: code.replace(/\s/g, ''),
        })
        if (vErr) throw new Error(t('secBadCode'))
      }

      // Route by role (staff vs student portal)
      const { data: prof } = await supabase.from('profiles').select('role,is_active').single()
      window.location.href = prof?.role === 'student' ? '/portal' : '/'
    } catch (ex) {
      setErr(t(ex.message) !== ex.message ? t(ex.message) : ex.message)
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
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={!!mfaFactor} />
        </div>

        {mfaFactor && (
          <div className="field">
            <label htmlFor="code">Code d'authentification (application)</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
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
