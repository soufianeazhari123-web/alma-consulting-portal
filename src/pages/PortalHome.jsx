import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Loading, Empty, StageBadge, StatusBadge } from '../components/ui'

// STUDENT PORTAL — strictly scoped by RLS to the student's own data.
export default function PortalHome() {
  const { profile } = useAuth()
  const { t, lang, setLang } = useLang()
  const [cases, setCases] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [paid, setPaid] = useState(0)

  useEffect(() => { load() }, [])
  async function load() {
    if (!profile.student_id) return
    const [{ data: c }, { data: inv }, { data: pays }] = await Promise.all([
      supabase.from('cases')
        .select('*, country:countries(name_fr,name_en), service:service_types(label_fr,label_en)')
        .eq('student_id', profile.student_id),
      supabase.from('invoices').select('*').neq('status', 'void'),
      supabase.from('payments').select('amount,status'),
    ])
    setCases(c ?? [])
    setInvoices(inv ?? [])
    setPaid((pays ?? []).filter((p) => p.status === 'verified').reduce((s, p) => s + Number(p.amount), 0))
  }

  if (!profile.student_id) return <Empty msg={t('noCaseAttached')} />
  const invoiced = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const loc = lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR'

  return (
    <>
      <div className="topbar">
        <h1>{t('welcome')}, {profile.full_name}</h1>
        <button className="btn ghost sm" onClick={() => setLang(lang === 'fr' ? 'en' : lang === 'en' ? 'ar' : 'fr')}>
          {lang === 'fr' ? t('english') : lang === 'en' ? 'العربية' : t('french')}
        </button>
      </div>

      <div className="grid c3">
        <div className="card stat gold"><div className="k">{t('remainingBalance')}</div>
          <div className="v">{(invoiced - paid).toLocaleString()} MAD</div></div>
        <div className="card stat"><div className="k">{t('totalPaid')}</div>
          <div className="v">{paid.toLocaleString()} MAD</div></div>
        <div className="card stat"><div className="k">{t('applications')}</div>
          <div className="v">{cases?.length ?? 0}</div></div>
      </div>

      <h2 className="section">{t('myCases')}</h2>
      {!cases ? <Loading /> : cases.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="grid c2">
          {cases.map((c) => (
            <div className="card" key={c.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{lang==='ar'?c.country.name_en:c.country.name_fr} — {lang==='ar'?c.service.label_en:c.service.label_fr}</strong>
                <StageBadge s={c.stage} />
              </div>
              {c.university && <p className="hint">{c.university} · {c.program}</p>}
              {c.application_deadline &&
                <p className="hint">📅 {t('deadline')} : {new Date(c.application_deadline).toLocaleDateString(loc)}</p>}
              {c.review_comment && <p className="err">💬 {c.review_comment}</p>}
              <Link to={`/portal/case/${c.id}`}>
                <button className="btn primary sm">{t('docsDetails')}</button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <h2 className="section">{t('invoices')}</h2>
      {invoices.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th>N°</th><th>{t('installmentLabel')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{invoices.map((i) => (
            <tr key={i.id}>
              <td><strong>{i.number}</strong></td>
              <td>{i.installment_no}/4</td>
              <td>{Number(i.amount).toLocaleString()} MAD</td>
              <td><StatusBadge s={i.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
