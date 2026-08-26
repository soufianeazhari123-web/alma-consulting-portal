import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, StageBadge, StatusBadge, ReadinessMeter } from '../components/ui'

const MAX_MB = 10
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/png']

export default function CaseDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [kase, setKase] = useState(null)
  const [items, setItems] = useState([])
  const [docs, setDocs] = useState({}) // item_id -> current doc row
  const [readiness, setReadiness] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [retakeOpen, setRetakeOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const isSA = profile.role === 'super_admin'
  const isDir = profile.role === 'director'
  const isAgentOwner = profile.role === 'agent' && kase?.agent_id === profile.id

  useEffect(() => { load() }, [id])
  async function load() {
    const [{ data: k }, { data: it }, { data: ch }] = await Promise.all([
      supabase.from('cases')
        .select('*, student:students(id,full_name,ref,email), country:countries(name_fr,name_en), service:service_types(label_fr,label_en,key)')
        .eq('id', id).single(),
      supabase.from('case_checklist_items').select('*').eq('case_id', id).order('sort_order'),
      supabase.from('case_history').select('*').eq('case_id', id).order('created_at', { ascending: false }).limit(30),
    ])
    setKase(k); setItems(it ?? []); setHistory(ch ?? [])

    const { data: dd } = await supabase.from('case_documents')
      .select('*').eq('case_id', id).eq('status', 'current')
    setDocs(Object.fromEntries((dd ?? []).map((d) => [d.checklist_item_id, d])))

    try {
      const { data: r } = await supabase.rpc('compute_readiness', { p_case: id })
      setReadiness(r)
    } catch { /* non-staff */ }
  }

  async function upload(item, file) {
    if (!file) return
    if (!OK_MIME.includes(file.type)) return alert(t('errPdfJpgPng'))
    if (file.size > MAX_MB * 1024 * 1024) return alert(t('errMaxSize'))
    setBusy(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${kase.student.id}/${kase.id}/${item.id}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, file, {
        contentType: file.type, upsert: false,
      })
      if (upErr) throw upErr
      const { error: regErr } = await supabase.rpc('register_upload', {
        p_item: item.id, p_path: path, p_file_name: file.name,
        p_mime: file.type, p_size: file.size,
      })
      if (regErr) throw regErr
      await load()
    } catch (ex) { alert(ex.message) } finally { setBusy(false) }
  }

  async function download(doc) {
    const { data, error } = await supabase.storage.from('case-documents').download(doc.storage_path)
    if (error) return alert(error.message)
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = doc.file_name; a.click()
    URL.revokeObjectURL(url)
  }

  async function transition(stage) {
    let reason = null
    if (stage === 'changes_requested' || stage === 'withdrawn') {
      reason = prompt(t('reasonPrompt')) ?? ''
      if (!reason.trim()) return alert(t('reasonRequiredAlert'))
    }
    setBusy(true)
    try {
      await supabase.rpc('transition_case', { p_case: id, p_new_stage: stage, p_reason: reason })
      await load()
    } catch (ex) { alert(ex.message) } finally { setBusy(false) }
  }

  async function review(decision) {
    const comment = prompt(decision === 'returned' ? t('changesPrompt') : t('commentOptional')) ?? ''
    if (decision === 'returned' && !comment.trim()) return alert(t('reasonRequiredAlert'))
    try {
      await supabase.rpc('review_case', { p_case: id, p_decision: decision, p_comment: comment })
      await load()
    } catch (ex) { alert(ex.message) }
  }

  async function refreshScore() {
    try {
      const r = await supabase.rpc('save_readiness', { p_case: id })
      setReadiness(r.data)
    } catch (ex) { alert(ex.message) }
  }

  if (!kase) return <Loading />

  const stage = kase.stage
  const canPrepare = (isAgentOwner || isDir || isSA) &&
    !['submitted','accepted','rejected','visa_approved','visa_refused','closed'].includes(stage)

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page">
            {kase.ref} · {kase.student.full_name}
            {kase.is_free_retake && <> <span className="badge gold">{t('freeRetake')}</span></>}
          </h1>
          <p className="hint">
            {kase.student.ref} · {lang==='ar' ? kase.country.name_en : kase.country.name_fr} · {lang==='ar' ? kase.service.label_en : kase.service.label_fr}
            {kase.university ? ` · ${kase.university}` : ''}{kase.program ? ` · ${kase.program}` : ''}
          </p>
        </div>
        <div className="row">
          <StageBadge s={stage} />
          {readiness && <ReadinessMeter score={readiness.score} />}
          <button className="btn ghost sm" onClick={refreshScore}>↻</button>
          {canPrepare && <button className="btn ghost sm" onClick={() => setEditOpen(true)}>{t('details')}</button>}
        </div>
      </div>

      {/* Workflow actions */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          {isAgentOwner && stage === 'draft' &&
            <button className="btn primary" disabled={busy} onClick={() => transition('documents_in_progress')}>
              {t('startDocuments')}</button>}
          {isAgentOwner && stage === 'documents_in_progress' &&
            <button className="btn primary" disabled={busy} onClick={() => transition('ready_for_review')}>
              {t('markReady')}</button>}

          {isSA && stage === 'ready_for_review' && <>
            <button className="btn ok" disabled={busy} onClick={() => review('approved')}>{t('approveShort')}</button>
            <button className="btn danger" disabled={busy} onClick={() => review('returned')}>{t('requestChangesShort')}</button>
          </>}

          {(isSA) && stage === 'approved_for_submission' && kase.service.key === 'university_application' &&
            <button className="btn primary" disabled={busy} onClick={() => transition('submitted')}>
              {t('submitExternal')}</button>}
          {(isSA) && stage === 'approved_for_submission' && kase.service.key === 'visa_trp' &&
            <button className="btn primary" disabled={busy} onClick={() => transition('appointment_booked')}>
              {t('apptConfirmed')}</button>}
          {(isSA) && stage === 'appointment_booked' &&
            <button className="btn primary" disabled={busy} onClick={() => transition('submitted')}>{t('depositedSA')}</button>}
          {isSA && stage === 'submitted' && <>
            <button className="btn ok" disabled={busy} onClick={() =>
              transition(kase.service.key === 'visa_trp' ? 'biometrics_interview' : 'accepted')}>
              {kase.service.key === 'visa_trp' ? t('biometricsBtn') : t('acceptedBtn')}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => transition('additional_info_requested')}>{t('infoRequestedBtn')}</button>
          </>}
          {isSA && stage === 'biometrics_interview' && <>
            <button className="btn ok" disabled={busy} onClick={() => transition('visa_approved')}>{t('visaApprovedBtn')}</button>
            <button className="btn danger" disabled={busy} onClick={() => transition('visa_refused')}>{t('visaRefusedBtn')}</button>
          </>}

          {(isSA || isDir) && !['closed','withdrawn'].includes(stage) &&
            <button className="btn ghost sm" disabled={busy} onClick={() => transition('withdrawn')}>{t('withdrawCase')}</button>}
          {isSA && !['closed'].includes(stage) &&
            <button className="btn ghost sm" disabled={busy} onClick={() => transition('closed')}>{t('closeCase')}</button>}
        </div>
        {kase.review_comment && <p className="err">{t('lastFeedback')} {kase.review_comment}</p>}
        {['rejected','visa_refused'].includes(kase.decision_outcome) && (isSA || isDir) && (
          <p style={{ marginTop: 8 }}>
            <button className="btn gold btn sm" onClick={() => setRetakeOpen(true)}>{t('retakeBtn')}</button>
          </p>
        )}
      </div>

      {/* Checklist */}
      <h2 className="section">{t('checklist')} — {t('country')} : {lang==='ar' ? kase.country.name_en : kase.country.name_fr}</h2>
      <div className="tablewrap"><table className="tbl">
        <thead><tr>
          <th>{t('document')}</th><th>{t('status')}</th><th>{t('translation')}</th><th>{t('legalisation')}</th>
          <th>{t('file')}</th><th className="no-print">{t('actions')}</th>
        </tr></thead>
        <tbody>{items.map((it) => (
          <tr key={it.id}>
            <td>
              <strong>{lang==='ar' ? it.name_en : it.name_fr}</strong>{' '}
              {it.is_required ? <span className="badge red">{t('required')}</span> : <span className="badge gray">{t('optional')}</span>}
              {it.guidance_fr && <><br /><small className="hint">{it.guidance_fr}</small></>}
            </td>
            <td><StatusBadge s={it.status} /></td>
            <td>{it.translation_required ? t('yes') : t('none')}</td>
            <td>{it.legalisation_required ? (it.legalisation_mode || '✓') : t('none')}</td>
            <td>{docs[it.id]
              ? <a href="#" onClick={(e) => { e.preventDefault(); download(docs[it.id]) }}>{docs[it.id].file_name}</a>
              : <span className="hint">—</span>}</td>
            <td className="no-print row">
              {canPrepare && <>
                <label className="btn ghost sm" style={{ margin: 0 }}>
                  {t('uploadBtn')}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden
                    onChange={(e) => upload(it, e.target.files[0])} />
                </label>
              </>}
              {(isDir || isSA) && docs[it.id] &&
                <select defaultValue="" className="btn ghost sm" style={{ width: 'auto' }}
                  onChange={(e) => e.target.value && reviewItem(it, e.target.value, t)}>
                  <option value="">{t('revise')}</option>
                  <option value="approved">{t('reviseApprove')}</option>
                  <option value="changes_requested">{t('reviseChanges')}</option>
                  <option value="waived">{t('reviseWaive')}</option>
                </select>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      {/* History */}
      <h2 className="section">{t('caseHistory')}</h2>
      <ul className="hint" style={{ lineHeight: 1.9 }}>
        {history.map((h) => (
          <li key={h.id}>
            {new Date(h.created_at).toLocaleString(lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR')} — <strong>{h.field}</strong> :
            {h.old_value} → <strong>{h.new_value}</strong>
            {h.actor_staff_code ? ` (${h.actor_staff_code})` : ''}
            {h.reason ? ` — ${h.reason}` : ''}
          </li>
        ))}
      </ul>

      {retakeOpen && <FreeRetakeModal source={kase} onClose={() => setRetakeOpen(false)} />}
      {editOpen && (
        <EditDetailsModal kase={kase} onClose={() => setEditOpen(false)} onSaved={async () => { setEditOpen(false); await load() }} />
      )}
    </>
  )
}

async function reviewItem(item, status, t) {
  let comment = null
  if (status === 'changes_requested') {
    comment = prompt(t('changesPrompt')) ?? ''
    if (!comment.trim()) return
  }
  try {
    await supabase.rpc('review_checklist_item', { p_item: item.id, p_status: status, p_comment: comment })
    window.location.reload()
  } catch (ex) { alert(ex.message) }
}

function EditDetailsModal({ kase, onClose, onSaved }) {
  const { t } = useLang()
  return (
    <Modal title={t('editDetails')} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault()
        const f = Object.fromEntries(new FormData(e.target))
        try {
          await supabase.rpc('update_case_details', {
            p_case: kase.id,
            p_university: f.university || null,
            p_program: f.program || null,
            p_study_level: f.study_level || null,
            p_intake: f.intake || null,
            p_intake_month: f.intake_month || null,
            p_deadline: f.application_deadline || null,
          })
          alert(t('editSaved')); onSaved()
        } catch (ex) {
          alert(ex.message === 'CASE_FROZEN' ? t('caseFrozen') : ex.message)
        }
      }}>
        <Field label={t('university')}><input name="university" defaultValue={kase.university ?? ''} /></Field>
        <div className="grid c2">
          <Field label={t('program')}><input name="program" defaultValue={kase.program ?? ''} /></Field>
          <Field label={t('level')}><input name="study_level" defaultValue={kase.study_level ?? ''} /></Field>
          <Field label={t('intakeFree')}><input name="intake" defaultValue={kase.intake ?? ''} /></Field>
          <Field label={t('season')}>
            <select name="intake_month" defaultValue={kase.intake_month ?? ''}>
              <option value="">—</option>
              <option value="september">{t('seasonSept')}</option>
              <option value="february">{t('seasonFeb')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('deadline')}><input type="date" name="application_deadline" defaultValue={kase.application_deadline ?? ''} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function FreeRetakeModal({ source, onClose }) {
  const { t, lang } = useLang()
  const [countries, setCountries] = useState(null)
  const [services, setServices] = useState([])
  useEffect(() => {
    supabase.from('countries').select('id,name_fr,name_en').order('sort_order').then(({ data }) => setCountries(data ?? []))
    supabase.from('service_types').select('id,label_fr,label_en,key').then(({ data }) => setServices(data ?? []))
  }, [])
  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    try {
      await supabase.rpc('create_free_retake', {
        p_source_case: source.id, p_country: f.country_id,
        p_service_type: f.service_type_id, p_university: f.university || null, p_program: f.program || null,
      })
      onClose()
      alert(t('retakeDone'))
      window.location.href = `/students/${source.student.id}`
    } catch (ex) { alert(ex.message) }
  }
  return (
    <Modal title={t('retakeTitle')} onClose={onClose}>
      {!countries ? <Loading /> : (
        <form onSubmit={submit}>
          <Field label={`${t('country')} *`}><select name="country_id" required>
            {countries.map((c) => <option key={c.id} value={c.id}>{lang==='ar'?c.name_en:c.name_fr}</option>)}
          </select></Field>
          <Field label={`${t('service')} *`}><select name="service_type_id" required>
            {services.map((s) => <option key={s.id} value={s.id}>{lang==='ar'?s.label_en:s.label_fr}</option>)}
          </select></Field>
          <Field label={t('university')}><input name="university" /></Field>
          <Field label={t('program')}><input name="program" /></Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
            <button className="btn primary">{t('create')}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
