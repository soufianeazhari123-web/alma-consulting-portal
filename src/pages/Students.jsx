import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, callAdminFn } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty } from '../components/ui'
import { exportCsv } from '../lib/csv'

export default function Students() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)

  const canArchive = ['director', 'super_admin'].includes(profile.role)
  const isSA = profile.role === 'super_admin'

  useEffect(() => { load() }, [])
  async function load() {
    let query = supabase.from('students')
      .select('*, agency:agencies(name), agent:profiles!students_main_agent_id_fkey(full_name)')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    if (q) query = query.or(`full_name.ilike.%${q}%,ref.ilike.%${q}%,passport_number.ilike.%${q}%`)
    const { data } = await query
    setRows(data ?? [])
  }

  // Q22 owner decision: directors + SA may archive a student (10-year retention keeps history)
  async function archiveStudent(s) {
    if (!confirm(t('archiveConfirm'))) return
    const { error } = await supabase.from('students').update({ is_archived: true }).eq('id', s.id)
    if (error) return alert(error.message)
    load()
  }

  async function deleteStudent(s) {
    if (!confirm(`${t('deleteConfirm')} ${s.full_name} ?`)) return
    const ans = prompt(t('typeDelete'))
    if (ans?.trim().toUpperCase() !== 'DELETE') { alert(t('reasonRequiredAlert')); return }
    try {
      await callAdminFn('delete_student', { student_id: s.id })
      load()
    } catch (ex) { alert(ex.message) }
  }

  return (
    <>
      <div className="topbar">
        <h1 className="page">{t('students')}</h1>
        <div className="row">
          <input placeholder={t('searchPh')} value={q} style={{ width: 220 }}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn ghost" onClick={load}>{t('filter')}</button>
          <button className="btn ghost" onClick={() => exportCsv('etudiants', 'students', rows ?? [], [
            { label: 'Ref', get: (s) => s.ref },
            { label: 'Nom', get: (s) => s.full_name },
            { label: 'Passeport', get: (s) => s.passport_number },
            { label: 'ExpPasseport', get: (s) => s.passport_expiry_date },
            { label: 'Agence', get: (s) => s.agency?.name },
            { label: 'Agent', get: (s) => s.agent?.full_name },
          ])}>⬇ CSV</button>
          {['agent','director','super_admin'].includes(profile.role) &&
            <button className="btn primary" onClick={() => setAdd(true)}>+ {t('addStudent')}</button>}
        </div>
      </div>

      {!rows ? <Loading /> : rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('ref')}</th><th>{t('fullName')}</th><th>{t('passportNum')}</th><th>{t('agency')}</th>
            <th>{t('agentCol')}</th><th>{t('passportExp')}</th>
            {(canArchive || isSA) && <th className="no-print"></th>}
          </tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}><strong>{s.ref}</strong></td>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}>{s.full_name}</td>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}>{s.passport_number || '—'}</td>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}>{s.agency?.name}</td>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}>{s.agent?.full_name ?? '—'}</td>
              <td className="clickable" onClick={() => nav(`/students/${s.id}`)}>{passportWarn(s.passport_expiry_date, t)}</td>
              {(canArchive || isSA) && (
                <td className="no-print">
                  {canArchive && <button className="btn ghost sm" title={t('archive')} onClick={(e) => { e.stopPropagation(); archiveStudent(s) }}>⏸</button>}
                  {isSA && <button className="btn danger sm" title={t('deleteConfirm')} onClick={(e) => { e.stopPropagation(); deleteStudent(s) }}>🗑</button>}
                </td>
              )}
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {add && <AddStudent onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load() }} />}
    </>
  )
}

function passportWarn(d, t) {
  if (!d) return <span className="hint">—</span>
  const days = (new Date(d) - new Date()) / 86400000
  if (days < 0) return <span className="badge red">{t('passportExpired')}</span>
  if (days < 180) return <span className="badge orange">{d}</span>
  return d
}

// Enrollment form — spec §5. Agreement signed IN AGENCY only.
// Pays souhaités (multi) → checklist auto + création des dossiers liés.
function AddStudent({ onClose, onSaved }) {
  const { profile } = useAuth()
  const { t } = useLang()
  const [countries, setCountries] = useState(null)
  const [services, setServices] = useState([])
  const [selCountries, setSelCountries] = useState([])
  const [selServices, setSelServices] = useState([])
  const [previews, setPreviews] = useState({})

  useEffect(() => {
    supabase.from('countries').select('id,name_fr,code').order('sort_order').then(({ data }) => setCountries(data ?? []))
    supabase.from('service_types').select('id,label_fr,key').eq('is_active', true).then(({ data }) => setServices(data ?? []))
  }, [])

  useEffect(() => {
    if (!selCountries.length || !selServices.length) { setPreviews({}); return }
    let live = true
    ;(async () => {
      const out = {}
      for (const cid of selCountries) {
        for (const sid of selServices) {
          const key = `${cid}:${sid}`
          const { data: tpl } = await supabase.from('service_templates').select('id').eq('country_id', cid).eq('service_type_id', sid).eq('status', 'published').order('version', { ascending: false }).limit(1).maybeSingle()
          if (!tpl) { out[key] = []; continue }
          const { data: items } = await supabase.from('document_templates').select('name_fr,is_required').eq('template_id', tpl.id).order('sort_order')
          out[key] = items ?? []
        }
      }
      if (live) setPreviews(out)
    })()
    return () => { live = false }
  }, [selCountries, selServices])

  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    // Force les valeurs RLS depuis le profil connecté (évite agency_id null comme Staff.jsx)
    const agencyId = profile.role === 'super_admin' ? f.agency_id : profile.agency_id
    const mainAgentId = profile.role === 'agent' ? profile.id : (f.main_agent_id || null)
    if (!agencyId) return alert('Agence manquante — reconnectez-vous.')
    if (profile.role === 'agent' && !mainAgentId) return alert('Agent manquant.')
    const payload = {
      full_name: f.full_name,
      date_of_birth: f.date_of_birth || null,
      place_of_birth: f.place_of_birth || null,
      cin_number: f.cin_number || null,
      passport_number: f.passport_number || null,
      passport_expiry_date: f.passport_expiry_date || null,
      email: f.email || null,
      phone: f.phone || null,
      address: f.address || null,
      preferred_language: f.preferred_language,
      academic_background: f.academic_background || null,
      language_level: f.language_level || null,
      visa_refusal_history: f.visa_refusal_history || null,
      agreement_signed_at: f.agreement_signed_at || null,
      privacy_consent_at: new Date().toISOString(),
      agency_id: agencyId,
      main_agent_id: mainAgentId,
      created_by: profile.id,
    }
    const { data: created, error } = await supabase.from('students').insert(payload).select('id,ref').single()
    if (error) return alert(error.message)
    // Crée un dossier par couple pays×service (checklist auto via trigger) — les deux services si cochés
    for (const cid of selCountries) {
      for (const sid of selServices) {
        const { error: cErr } = await supabase.from('cases').insert({
          student_id: created.id, agency_id: payload.agency_id, agent_id: payload.main_agent_id,
          country_id: cid, service_type_id: sid,
        })
        if (cErr) console.error('case create', cErr.message)
      }
    }
    onSaved()
  }
  return (
    <Modal title={t('newStudent')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label={`${t('fullName')} *`}><input name="full_name" required /></Field>
        <div className="grid c2">
          <Field label={t('dob')}><input type="date" name="date_of_birth" /></Field>
          <Field label={t('pob')}><input name="place_of_birth" /></Field>
          <Field label={t('cin')}><input name="cin_number" /></Field>
          <Field label={t('passportNum')}><input name="passport_number" /></Field>
          <Field label={t('passportExp')}><input type="date" name="passport_expiry_date" /></Field>
          <Field label={t('language')}>
            <select name="preferred_language" defaultValue="fr">
              <option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option>
            </select>
          </Field>
        </div>
        <div className="grid c2">
          <Field label={t('email')}><input type="email" name="email" /></Field>
          <Field label={t('phone')}><input name="phone" /></Field>
        </div>
        <Field label={t('address')}><input name="address" /></Field>
        <div className="grid c2">
          <Field label={t('academicBg')}><input name="academic_background" /></Field>
          <Field label={t('langLevel')}><input name="language_level" placeholder="ex: B2 anglais" /></Field>
        </div>
        <Field label={t('refusalHistory')}><textarea name="visa_refusal_history" rows={2} /></Field>
        <div className="grid c2">
          <Field label={t('agreementDate')}><input type="date" name="agreement_signed_at" /></Field>
        </div>

        <div className="card" style={{ background: '#fbfaf5', marginBottom: 12, border: '1px solid #e5e1d8' }}>
          <strong style={{ fontSize: 13 }}>🌍 Pays souhaités — checklist auto</strong>
          <div className="hint" style={{ marginBottom: 8 }}>Cochez un ou plusieurs pays, la checklist des documents s'affiche et les dossiers seront créés automatiquement.</div>
          {!countries ? <Loading /> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              {countries.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#fff', border: '1px solid #e5e1d8', padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selCountries.includes(c.id)} onChange={(e) => setSelCountries(e.target.checked ? [...selCountries, c.id] : selCountries.filter(x => x !== c.id))} />
                  {c.name_fr}
                </label>
              ))}
            </div>
          )}
          {selCountries.length > 0 && (
            <>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 12 }}>Services (cochez un ou les deux — la plupart des étudiants veulent les deux)</strong>
                <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  {services.map((s) => (
                    <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#fff', border: '1px solid #e5e1d8', padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selServices.includes(s.id)} onChange={(e) => setSelServices(e.target.checked ? [...selServices, s.id] : selServices.filter(x => x !== s.id))} />
                      {s.label_fr}
                    </label>
                  ))}
                </div>
              </div>
              {selServices.length > 0 && Object.entries(previews).map(([key, items]) => {
                const [cid, sid] = key.split(':')
                const cname = (countries || []).find(x => x.id === cid)?.name_fr || cid
                const sname = (services || []).find(x => x.id === sid)?.label_fr || sid
                return (
                  <div key={key} style={{ marginTop: 10 }}>
                    <strong style={{ fontSize: 12 }}>{cname} · {sname} — {items.length} doc(s)</strong>
                    {items.length === 0 ? <p className="hint" style={{ margin: '4px 0' }}>{t('noTemplateWarn')}</p> : (
                      <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 12 }}>
                        {items.map((it, i) => <li key={i}>{it.name_fr} {it.is_required ? <span className="badge red" style={{ fontSize: 10 }}>requis</span> : ''}</li>)}
                      </ul>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <p className="hint">{t('consentAutoNote')}</p>
        <SuperAdminAgencyPicker />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function SuperAdminAgencyPicker() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [agencies, setAgencies] = useState([])
  const isSA = profile.role === 'super_admin'
  useEffect(() => {
    if (isSA) supabase.from('agencies').select('id,name').eq('is_active', true).then(({ data }) => setAgencies(data ?? []))
  }, [isSA])
  if (!isSA) return null
  return (
    <Field label={`${t('agency')} *`}>
      <select name="agency_id" required>
        {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </Field>
  )
}
