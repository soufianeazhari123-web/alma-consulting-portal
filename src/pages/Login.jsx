import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'

function normalizePhone(raw) {
  let p = raw.trim().replace(/[\s\-\.]/g, '')
  if (!p) return p
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (p.startsWith('0')) p = '+212' + p.slice(1)
  if (!p.startsWith('+')) p = '+' + p
  return p
}

export default function Login() {
  const { signIn } = useAuth()
  const { t } = useLang()
  const [mode, setMode] = useState('password') // password | otp
  const [contact, setContact] = useState('info@almaconsulting.lt')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('request')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ownerExists, setOwnerExists] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .then(({ count }) => setOwnerExists((count ?? 0) > 0))
  }, [])

  const cleanContact = contact.trim()
  const isEmail = cleanContact.includes('@')

  async function submitPassword(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await signIn(contact, password)
      const { data: prof } = await supabase.from('profiles').select('role,is_active').single()
      window.location.href = prof?.role === 'student' ? '/portal' : '/'
    } catch (ex) {
      setErr(t(ex.message) !== ex.message ? t(ex.message) : ex.message)
      setBusy(false)
    }
  }

  async function requestOtp(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (!cleanContact) throw new Error('Entrez votre e-mail ou numéro.')
      const opts = isEmail ? { email: cleanContact.toLowerCase() } : { phone: normalizePhone(cleanContact) }
      const { error } = await supabase.auth.signInWithOtp({ ...opts, options: { shouldCreateUser: false } })
      if (error) throw error
      setStep('verify')
    } catch (ex) {
      const msg = ex.message || String(ex)
      if (msg.toLowerCase().includes('not enabled')) setErr(isEmail ? msg : 'SMS non configuré. Utilisez votre e-mail.')
      else setErr(msg)
    } finally { setBusy(false) }
  }

  async function verifyOtp(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const token = code.replace(/\s/g, '')
      if (token.length < 6) throw new Error('Code invalide.')
      const { error } = isEmail
        ? await supabase.auth.verifyOtp({ email: cleanContact.toLowerCase(), token, type: 'email' })
        : await supabase.auth.verifyOtp({ phone: normalizePhone(cleanContact), token, type: 'sms' })
      if (error) throw error
      const { data: prof } = await supabase.from('profiles').select('role,is_active').single()
      window.location.href = prof?.role === 'student' ? '/portal' : '/'
    } catch (ex) {
      setErr(ex.message || String(ex))
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">ALMA CONSULTING</div>
        <div className="auth-sub">{t('login')}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button type="button" className={'btn ' + (mode === 'password' ? 'primary' : '')} style={{ flex: 1 }} onClick={() => { setMode('password'); setErr(null) }}>Mot de passe</button>
          <button type="button" className={'btn ' + (mode === 'otp' ? 'primary' : '')} style={{ flex: 1 }} onClick={() => { setMode('otp'); setErr(null); setStep('request') }}>Code par e-mail / SMS</button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={submitPassword}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" required autoComplete="username" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? '…' : t('signIn')}</button>
          </form>
        ) : step === 'request' ? (
          <form onSubmit={requestOtp}>
            <div className="field">
              <label htmlFor="contact">E-mail ou numéro</label>
              <input id="contact" type="text" required placeholder="info@almaconsulting.lt  ou  06 12 34 56 78" value={contact} onChange={(e) => setContact(e.target.value)} />
              <div className="hint" style={{ marginTop: 6 }}>Vous recevrez un lien/codes par e-mail (ou SMS).</div>
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? '…' : 'Recevoir le code'}</button>
            {err && String(err).toLowerCase().includes('rate limit') && <div className="hint" style={{ marginTop: 8 }}>Quota OTP atteint — passez en <b>Mot de passe</b> ou attendez 1h / augmentez la limite dans Supabase → Auth → Rate Limits.</div>}
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <div className="hint" style={{ marginBottom: 10 }}>E-mail envoyé à <b>{cleanContact}</b> — cliquez <b>Sign in</b> dans l'e-mail, ou saisissez le code à 6 chiffres ici.</div>
            <div className="field">
              <label htmlFor="code">Code à 6 chiffres (optionnel si vous avez cliqué le lien)</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy}>{busy ? '…' : 'Vérifier et se connecter'}</button>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={requestOtp} disabled={busy}>Renvoyer</button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { setStep('request'); setCode(''); setErr(null) }} disabled={busy}>Modifier</button>
            </div>
          </form>
        )}

        {!ownerExists && <p style={{ textAlign: 'center', marginTop: 16 }}><Link to="/setup" className="hint">{t('setupTitle')} →</Link></p>}
      </div>
    </div>
  )
}
