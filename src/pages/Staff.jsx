import React, { useEffect, useState } from 'react'
import { supabase, callAdminFn } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty } from '../components/ui'

export default function Staff() {
  const { profile } = useAuth()
  const { t } = useLang()
  const isSA = profile.role === 'super_admin'
  const [rows, setRows] = useState(null)
  const [agencies, setAgencies] = useState([])
  const [add, setAdd] = useState(false)
  const [result, setResult] = useState(null)
  const [resetUrl, setResetUrl] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { load() }, [])
  async function load() {
    let q = supabase.from('profiles')
      .select('*, agency:agencies(name)')
      .in('role', ['super_admin', 'director', 'agent'])
      .order('role').order('full_name')
    const { data } = await q
    setRows(data ?? [])
    if (isSA) {
      const { data: ag } = await supabase.from('agencies').select('id,name').eq('is_active', true)
      setAgencies(ag ?? [])
    } else {
      setAgencies(profile.agency_id ? [{ id: profile.agency_id, name: profile.agency?.name }] : [])
    }
  }

  async function invite(e) {
    e.preventDefault(); setErr(null)
    const f = Object.fromEntries(new FormData(e.target))
    try {
      const r = await callAdminFn('invite_staff', f)
      setResult(r); setAdd(false); load()
    } catch (ex) {
      setErr(ex.message === 'email_exists' ? t('emailTaken')
        : ex.message === 'wrong_agency' ? t('wrongAgency')
        : ex.message)
    }
  }

  async function toggle(row) {
    if (!confirm(`${row.is_active ? t('deactivateQ') : t('reactivateQ')} ${row.full_name} ?`)) return
    try {
      await callAdminFn('set_active', { profile_id: row.id, active: !row.is_active })
      load()
    } catch (ex) { alert(ex.message) }
  }

  async function resetLink(row) {
    try {
      const r = await callAdminFn('reset_link', { profile_id: row.id })
      setResetUrl(r.reset_link)
    } catch (ex) { alert(ex.message) }
  }

  if (!rows) return <Loading />

  const canInviteRole = isSA ? ['director','agent'] : ['agent']

  return (
    <>
      <div className="topbar">
        <h1 className="page">{t('team')}</h1>
        {(isSA || profile.role === 'director') &&
          <button className="btn primary" onClick={() => { setErr(null); setAdd(true) }}>{t('addMember')}</button>}
      </div>

      {rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('staffCode')}</th><th>{t('fullName')}</th><th>{t('role')}</th><th>{t('agency')}</th>
            <th>{t('status')}</th><th>Dernière connexion</th><th></th>
          </tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.staff_code || '—'}</strong></td>
              <td>{p.full_name}<br /><small className="hint">{p.email}</small></td>
              <td><span className="badge gray">{t(p.role)}</span></td>
              <td>{p.agency?.name ?? '—'}</td>
              <td>{p.is_active ? <span className="badge green">{t('active')}</span> : <span className="badge red">{t('inactive')}</span>}</td>
              <td>{p.last_login_at ? new Date(p.last_login_at).toLocaleString('fr-FR') : '—'}</td>
              <td className="row no-print">
                {p.role !== 'super_admin' && p.id !== profile.id &&
                  <button className="btn ghost sm" onClick={() => toggle(p)}>
                    {p.is_active ? '⏸' : '▶'}
                  </button>}
                {p.role !== 'super_admin' &&
                  <button className="btn ghost sm" title="Réinitialiser mot de passe" onClick={() => resetLink(p)}>🔑</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {add && (
        <Modal title={t('addMember')} onClose={() => { setAdd(false); setResult(null) }}>
          {result ? (
            <>
              <p><strong>{result.staff_code}</strong></p>
              <p className="hint">{t('tempPasswordOnce')}</p>
              <p><code style={{ fontSize: 16 }}>{result.temp_password}</code></p>
              <button className="btn primary" onClick={() => setResult(null)}>{t('close')}</button>
            </>
          ) : (
            <form onSubmit={invite}>
              <Field label={t('fullName')}><input name="full_name" required /></Field>
              <Field label={t('email')}><input name="email" type="email" required /></Field>
              <Field label={t('password')}><input name="password" type="password" minLength={8} placeholder={t('leaveEmptyAuto') || 'Laissez vide → auto-généré'} /></Field>
              <Field label={t('role')}>
                <select name="role" required>
                  {canInviteRole.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                </select>
              </Field>
              <Field label={t('agency')}>
                {isSA ? (
                  <select name="agency_id" required>
                    {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input value={profile.agency?.name ?? ''} disabled />
                    <input type="hidden" name="agency_id" value={profile.agency?.id ?? ''} />
                  </>
                )}
              </Field>
              {err && <p className="err">{err}</p>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn ghost" onClick={() => { setAdd(false); setResult(null) }}>{t('cancel')}</button>
                <button className="btn primary">{t('save')}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {resetUrl && (
        <Modal title={t('resetPwdTitle')} onClose={() => setResetUrl(null)}>
          <p className="hint">{t('resetLinkHint') || 'Lien à usage unique — envoyez-le au membre :'}</p>
          <p style={{ wordBreak: 'break-all', background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}><code style={{ fontSize: 12 }}>{resetUrl}</code></p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => navigator.clipboard.writeText(resetUrl)}>Copier</button>
            <button className="btn primary" onClick={() => setResetUrl(null)}>{t('close')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
