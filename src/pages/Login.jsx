import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'

export default function Login() {
  const { t } = useLang()
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ownerExists, setOwnerExists] = useState(true)

  useEffect(() => {
    // Show setup link only before the owner account exists
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .then(({ count }) => setOwnerExists((count ?? 0) > 0))
  }, [])

  async function googleLogin() {
    setErr(null); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' },
      })
      if (error) throw error
      // redirect happens automatically; keep button busy
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

        <button className="btn primary" style={{ width: '100%', marginTop: 8 }}
          onClick={googleLogin} disabled={busy}>
          {busy ? '…' : 'Continuer avec Google'}
        </button>

        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}

        {!ownerExists && (
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/setup" className="hint">{t('setupTitle')} →</Link>
          </p>
        )}
      </div>
    </div>
  )
}
