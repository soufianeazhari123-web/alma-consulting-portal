import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Field, Loading } from '../components/ui'

// Q13: Super Admins and directors MUST enroll a TOTP factor before working.
// Already-enrolled users landing here (aal1) verify their code to continue.
export default function Security() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [state, setState] = useState('loading') // loading|enroll|verify
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)

  useEffect(() => { init() }, [])
  async function init() {
    const lvl = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (lvl.data?.currentLevel === 'aal2') return nav('/', { replace: true })

    const { data: mf } = await supabase.auth.mfa.listFactors()
    const verified = (mf?.all ?? []).find((f) => f.status === 'verified')
    if (verified) {
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId: verified.id })
      setFactorId(verified.id); setChallengeId(ch.id); setState('verify')
    } else {
      const { data: en, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: `ALMA-${profile.staff_code ?? ''}`,
      })
      if (error) return setErr(error.message)
      setFactorId(en.id); setSecret(en.totp.secret); setState('enroll')
    }
  }

  async function submit(e) {
    e.preventDefault(); setErr(null)
    try {
      let ch = challengeId
      if (!ch) {
        const { data: c } = await supabase.auth.mfa.challenge({ factorId })
        ch = c.id
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId, challengeId: ch, code: code.replace(/\s/g, ''),
      })
      if (error) throw new Error(t('secBadCode'))
      nav('/', { replace: true })
    } catch (ex) { setErr(ex.message) }
  }

  if (state === 'loading' && !err) return <Loading />

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">{t('secBrand')}</div>
        <div className="auth-sub">{t('secSub')}</div>

        {err && <p className="err">{err}</p>}

        {state === 'enroll' ? (
          <>
            <p style={{ lineHeight: 1.6 }}>{t('secEnrollIntro')}</p>
            <p style={{ textAlign: 'center' }}>
              <code style={{ fontSize: 18, letterSpacing: 2, wordBreak: 'break-all' }}>{secret}</code>
            </p>
            <Field label={t('secCodeLabel')}>
              <input inputMode="numeric" maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </>
        ) : state === 'verify' ? (
          <>
            <p>{t('secVerifyIntro')}</p>
            <Field label={t('secCodeLabel')}>
              <input inputMode="numeric" maxLength={6} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </>
        ) : null}

        <button className="btn primary" style={{ width: '100%' }}>{t('secValidate')}</button>
        <button type="button" className="linklike" style={{ marginTop: 12 }}
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}>
          {t('signOut')}
        </button>
      </form>
    </div>
  )
}

