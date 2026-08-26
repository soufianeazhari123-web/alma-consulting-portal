import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Loading, StageBadge, StatusBadge } from '../components/ui'

const MAX_MB = 10
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/png']

// Student's own view of ONE application: stage, checklist, upload/download.
export default function PortalCase() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [kase, setKase] = useState(null)
  const [items, setItems] = useState([])
  const [docs, setDocs] = useState({})
  const [err, setErr] = useState(null)

  useEffect(() => { load() }, [id])
  async function load() {
    const [{ data: k, error: ke }, { data: it }, { data: dd }] = await Promise.all([
      supabase.from('cases')
        .select('*, country:countries(name_fr,name_en), service:service_types(label_fr,label_en)')
        .eq('id', id).eq('student_id', profile.student_id).single(),
      supabase.from('case_checklist_items').select('*').eq('case_id', id).order('sort_order'),
      supabase.from('case_documents').select('*').eq('case_id', id).eq('status', 'current'),
    ])
    if (ke || !k) return setErr(t('caseNotFoundPortal'))
    setKase(k); setItems(it ?? [])
    setDocs(Object.fromEntries((dd ?? []).map((d) => [d.checklist_item_id, d])))
  }

  async function upload(item, file) {
    if (!file) return
    setErr(null)
    if (!OK_MIME.includes(file.type)) return setErr(t('errPdfJpgPng'))
    if (file.size > MAX_MB * 1024 * 1024) return setErr(t('errMaxSize'))
    try {
      const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${profile.student_id}/${kase.id}/${item.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, file, {
        contentType: file.type, upsert: false,
      })
      if (upErr) throw upErr
      await supabase.rpc('portal_register_upload', {
        p_item: item.id, p_path: path, p_file_name: file.name,
        p_mime: file.type, p_size: file.size,
      })
      await load()
    } catch (ex) { setErr(ex.message) }
  }

  // Q12 owner decision: students can only DOWNLOAD documents approved by staff
  function canDownload(doc) {
    return doc.review_status === 'approved'
  }

  async function download(doc) {
    try {
      const { data, error } = await supabase.storage.from('case-documents').download(doc.storage_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = doc.file_name; a.click()
      URL.revokeObjectURL(url)
    } catch (ex) { setErr(ex.message) }
  }

  if (err) return <div className="card"><p className="err">{err}</p><Link to="/portal">← {t('back')}</Link></div>
  if (!kase) return <Loading />

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page">{lang==='ar'?kase.country.name_en:kase.country.name_fr} — {lang==='ar'?kase.service.label_en:kase.service.label_fr}</h1>
          <p className="hint">{kase.ref}{kase.university ? ` · ${kase.university}` : ''}
            {kase.application_deadline ? ` · ${t('dueOnP')} ${new Date(kase.application_deadline).toLocaleDateString(lang==='ar'?'ar-MA':lang==='en'?'en-GB':'fr-FR')}` : ''}</p>
        </div>
        <StageBadge s={kase.stage} />
      </div>

      {kase.review_comment && <div className="card" style={{ marginBottom: 14 }}>
        <span className="badge orange">{t('agencyMsgBadge')}</span> {kase.review_comment}</div>}

      <h2 className="section">{t('requestedDocs')}</h2>
      <div className="tablewrap"><table className="tbl">
        <thead><tr>
          <th>{t('document')}</th><th>{t('status')}</th><th>{t('yourFile')}</th><td></td>
        </tr></thead>
        <tbody>{items.map((it) => (
          <tr key={it.id}>
            <td>
              <strong>{lang==='ar'?it.name_en:it.name_fr}</strong>{' '}
              {it.is_required && <span className="badge red">{t('required')}</span>}
              {it.translation_required && <span className="badge blue">{t('translation')}</span>}
              {it.legalisation_required && <span className="badge gold">{it.legalisation_mode ?? t('legalisation')}</span>}
            </td>
            <td><StatusBadge s={it.status} /></td>
            <td>{docs[it.id]
              ? (canDownload(docs[it.id])
                  ? <a href="#" onClick={(e) => { e.preventDefault(); download(docs[it.id]) }}>{docs[it.id].file_name}</a>
                  : <span className="hint" title={t('approvedOnlyHint')}>🔒 {docs[it.id].file_name}</span>)
              : <span className="hint">{t('noFileYet')}</span>}</td>
            <td style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
              <label className="btn ghost sm" style={{ margin: 0 }}>
                {t('sendReplace')}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden
                  onChange={(e) => upload(it, e.target.files[0])} />
              </label>
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      <p style={{ marginTop: 16 }}><Link to="/portal">{t('backToApps')}</Link></p>
    </>
  )
}
