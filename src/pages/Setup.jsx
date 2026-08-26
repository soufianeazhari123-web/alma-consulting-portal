import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'

// One-time bootstrap: creates THE owner account (ALMA-0001).
// The DB trigger refuses a second super_admin — later signups land dormant.
export default function Setup() {
  const { t } = useLang()
  const [fullName, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)
  const [needConfirm, setNeedConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (password.length < 12) throw new Error('Le mot de passe doit contenir au moins 12 caractères.')
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName } },
      })
      if (error) throw error

      // If email confirmation is enabled, no session exists yet.
      if (!data.session) {
        setNeedConfirm(true); setOk(true); return
      }

      // Verify this signup actually became the owner (not a dormant pending row)
      const { data: prof } = await supabase.from('profiles')
        .select('role, staff_code, is_active').eq('id', data.user.id).single()
      if (!prof || prof.role !== 'super_admin') {
        throw new Error('Un compte propriétaire existe déjà ou la création a échoué.')
      }
      setOk(true)
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
        <div className="auth-sub">{t('setupTitle')}</div>
        <p className="hint" style={{ marginTop: -14, marginBottom: 18 }}>{t('setupDesc')}</p>

        {ok ? (
          <>
            <p className="badge green">
              {needConfirm
                ? 'Compte créé. Vérifiez votre boîte mail et confirmez votre adresse, puis connectez-vous — vous serez ALMA-0001.'
                : 'Compte ALMA-0001 créé.'}
            </p>
            <p><Link to="/login">→ {t('login')}</Link></p>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="fn">{t('fullName')}</label>
              <input id="fn" required value={fullName} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="em">{t('email')}</label>
              <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pw">{t('password')} (min. 12)</label>
              <input id="pw" type="password" minLength={12} required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
              {busy ? '…' : t('createOwner')}
            </button>
          </>
        )}
        <p style={{ textAlign: 'center', marginTop: 14 }}><Link to="/login" className="hint">← {t('login')}</Link></p>
      </form>
    </div>
  )
}
