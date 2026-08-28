import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, callAdminFn } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, StageBadge } from '../components/ui'
import NewCaseModal from './NewCase'

export default function StudentDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const { t } = useLang()
  const [student, setStudent] = useState(null)
  const [cases, setCases] = useState([])
  const [invoices, setInvoices] = useState([])
  const [newCase, setNewCase] = useState(false)
  const [portalMsg, setPortalMsg] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePassword, setInvitePassword] = useState('')

  useEffect(() => { load() }, [id])
  async function load() {
    const [{ data: s }, { data: c }, { data: inv }] = await Promise.all([
      supabase.from('students').select('*, agency:agencies(name), agent:profiles!students_main_agent_id_fkey(full_name)').eq('id', id).single(),
      supabase.from('cases').select('*, country:countries(name_fr,name_en), service:service_types(label_fr,label_en)')
        .eq('student_id', id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('student_id', id).neq('status', 'void'),
    ])
    setStudent(s); setCases(c ?? []); setInvoices(inv ?? [])
  }

  async function invitePortal(e) {
    if (e) e.preventDefault()
    try {
      const r = await callAdminFn('invite_student', { student_id: id, email: student.email, password: invitePassword })
      setPortalMsg(`${t('portalCreated')} ${r.temp_password} — ${r.ref || student.ref} (${r.portal_email})`)
      setInviteOpen(false); setInvitePassword('')
    } catch (ex) {
      setPortalMsg(
        ex.message === 'email_exists' ? t('emailTaken')
        : ex.message === 'portal_account_exists' ? t('portalExists')
        : ex.message === 'wrong_agency' ? t('wrongAgency')
        : ex.message)
    }
  }

  if (!student) return <Loading />

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page">{student.full_name}</h1>
          <p className="hint">{student.ref} · {student.agency?.name} · {t('agentCol')} : {student.agent?.full_name ?? '—'}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setInviteOpen(true)}>{t('activatePortal')}</button>
          <button className="btn primary" onClick={() => setNewCase(true)}>+ {t('newCase')}</button>
        </div>
      </div>

      {portalMsg && <div className="card" style={{ marginBottom: 14 }}><code>{portalMsg}</code></div>}

      {inviteOpen && (
        <Modal title={t('activatePortal')} onClose={() => setInviteOpen(false)}>
          <form onSubmit={invitePortal}>
            <Field label="Référence"><input value={student.ref} disabled /></Field>
            <Field label={`${t('email')} (optionnel)`}><input value={student.email || ''} disabled /></Field>
            <Field label={`${t('password')} *`}><input type="password" required minLength={8} value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Min. 8 caractères — à donner à l'étudiant" /></Field>
            <p className="hint">L'étudiant se connectera avec sa <b>référence</b> <code>{student.ref}</code> + ce mot de passe (ou son e-mail si renseigné).</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setInviteOpen(false)}>{t('cancel')}</button>
              <button className="btn primary">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}

      <div className="grid c2">
        <div className="card">
          <h2 className="section">{t('identity')}</h2>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
            <dt className="hint">{t('bornOn')}</dt><dd>{student.date_of_birth ?? '—'} {student.place_of_birth ? `· ${student.place_of_birth}` : ''}</dd>
            <dt className="hint">{t('cin')}</dt><dd>{student.cin_number ?? '—'}</dd>
            <dt className="hint">{t('passportNum')}</dt><dd>{student.passport_number ?? '—'} ({t('passportExp')}: {student.passport_expiry_date ?? '—'})</dd>
            <dt className="hint">{t('contact')}</dt><dd>{student.email ?? '—'}<br />{student.phone ?? '—'}</dd>
            <dt className="hint">{t('langLevel')}</dt><dd>{student.language_level ?? '—'}</dd>
            <dt className="hint">{t('agreementSigned')}</dt><dd>
              {student.agreement_signed_at
                ? `${t('signedInAgencyOn')} ${student.agreement_signed_at}`
                : <span className="badge orange">{t('notSigned')}</span>}
            </dd>
          </dl>
        </div>
        <FinancialCard studentId={id} />
      </div>

      <h2 className="section">{t('applications')} ({cases.length}) — {t('appsIndependent')}</h2>
      {cases.length === 0 ? <p className="hint">{t('noData')}</p> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('ref')}</th><th>{t('country')}</th><th>{t('service')}</th><th>{t('university')}</th>
            <th>{t('deadline')}</th><th>{t('stage')}</th>
          </tr></thead>
          <tbody>{cases.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
              <td><strong>{c.ref}</strong>{c.is_free_retake && <> <span className="badge gold">{t('freeRetake')}</span></>}</td>
              <td>{c.country?.name_fr}</td>
              <td>{c.service?.label_fr}</td>
              <td>{c.university ?? '—'}</td>
              <td>{c.application_deadline ?? '—'}</td>
              <td><StageBadge s={c.stage} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {newCase && <NewCaseModal student={student} onClose={() => setNewCase(false)} onSaved={() => { setNewCase(false); load() }} />}
    </>
  )
}

function FinancialCard({ studentId }) {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('*').eq('student_id', studentId).neq('status', 'void'),
      supabase.from('payments').select('amount,status').eq('student_id', studentId),
    ]).then(([inv, pay]) => {
      const invoiced = (inv.data ?? []).reduce((s, i) => s + Number(i.amount), 0)
      const collected = (pay.data ?? []).filter(p => p.status === 'verified').reduce((s, p) => s + Number(p.amount), 0)
      setRows({ invoiced, collected })
    })
  }, [studentId])
  if (!rows) return null
  return (
    <div className="card">
      <h2 className="section">{t('finances')}</h2>
      <div className="grid c3">
        <div className="stat"><div className="k">{t('invoiced')}</div><div className="v" style={{fontSize:18}}>{rows.invoiced.toLocaleString()} MAD</div></div>
        <div className="stat"><div className="k">{t('collectedVerified')}</div><div className="v" style={{fontSize:18}}>{rows.collected.toLocaleString()} MAD</div></div>
        <div className="stat"><div className="k">{t('balance')}</div><div className="v" style={{fontSize:18}}>{(rows.invoiced - rows.collected).toLocaleString()} MAD</div></div>
      </div>
    </div>
  )
}
