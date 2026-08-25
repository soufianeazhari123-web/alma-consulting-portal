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

  async function invitePortal() {
    try {
      const r = await callAdminFn('invite_student', { student_id: id, email: student.email })
      setPortalMsg(`Accès portail créé. Mot de passe temporaire : ${r.temp_password}`)
    } catch (ex) {
      setPortalMsg(ex.message === 'email_exists' ? 'Cet email a déjà un compte.'
        : ex.message === 'portal_account_exists' ? 'Le portail est déjà actif pour cet étudiant.' : ex.message)
    }
  }

  if (!student) return <Loading />
  const paid = invoices.length * 0 // computed below from verified payments instead

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page">{student.full_name}</h1>
          <p className="hint">{student.ref} · {student.agency?.name} · Agent : {student.agent?.full_name ?? '—'}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={invitePortal}>🔑 Activer le portail</button>
          <button className="btn primary" onClick={() => setNewCase(true)}>+ {t('newCase')}</button>
        </div>
      </div>

      {portalMsg && <div className="card" style={{ marginBottom: 14 }}><code>{portalMsg}</code></div>}

      <div className="grid c2">
        <div className="card">
          <h2 className="section">Identité</h2>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            <dt className="hint">Né(e) le</dt><dd>{student.date_of_birth ?? '—'} à {student.place_of_birth ?? '—'}</dd>
            <dt className="hint">CIN</dt><dd>{student.cin_number ?? '—'}</dd>
            <dt className="hint">Passeport</dt><dd>{student.passport_number ?? '—'} (exp. {student.passport_expiry_date ?? '—'})</dd>
            <dt className="hint">Contact</dt><dd>{student.email ?? '—'}<br />{student.phone ?? '—'}</dd>
            <dt className="hint">Niveau de langue</dt><dd>{student.language_level ?? '—'}</dd>
            <dt className="hint">Convention signée</dt><dd>
              {student.agreement_signed_at
                ? `✓ en agence le ${student.agreement_signed_at}`
                : <span className="badge orange">non signée</span>}
            </dd>
          </dl>
        </div>
        <FinancialCard studentId={id} />
      </div>

      <h2 className="section">{t('applications')} ({cases.length}) — chaque dossier est indépendant</h2>
      {cases.length === 0 ? <p className="hint">{t('noData')}</p> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('caseRef')}</th><th>Pays</th><th>Service</th><th>{t('university')}</th>
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
      <h2 className="section">Finances</h2>
      <div className="grid c3">
        <div className="stat"><div className="k">Facturé</div><div className="v" style={{fontSize:18}}>{rows.invoiced.toLocaleString()} MAD</div></div>
        <div className="stat"><div className="k">Encaissé (vérifié)</div><div className="v" style={{fontSize:18}}>{rows.collected.toLocaleString()} MAD</div></div>
        <div className="stat"><div className="k">Solde</div><div className="v" style={{fontSize:18}}>{(rows.invoiced - rows.collected).toLocaleString()} MAD</div></div>
      </div>
    </div>
  )
}
