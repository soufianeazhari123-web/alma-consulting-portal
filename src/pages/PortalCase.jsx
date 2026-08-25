import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Loading, StageBadge, StatusBadge } from '../components/ui'

const MAX_MB = 10
const OK_MIME = ['application/pdf', 'image/jpeg', 'image/png']

// Student's own view of ONE application: stage, checklist, upload/download.
export default function PortalCase() {
  const { id } = useParams()
  const { profile } = useAuth()
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
    if (ke || !k) return setErr("Ce dossier n'existe pas ou ne vous appartient pas.")
    setKase(k); setItems(it ?? [])
    setDocs(Object.fromEntries((dd ?? []).map((d) => [d.checklist_item_id, d])))
  }

  async function upload(item, file) {
    if (!file) return
    setErr(null)
    if (!OK_MIME.includes(file.type)) return setErr('Formats acceptés : PDF, JPG, PNG.')
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`Taille max : ${MAX_MB} Mo.`)
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

  async function download(doc) {
    const { data } = await supabase.storage.from('case-documents').download(doc.storage_path)
    if (!data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = doc.file_name; a.click()
    URL.revokeObjectURL(url)
  }

  if (err) return <div className="card"><p className="err">{err}</p><Link to="/portal">← Retour</Link></div>
  if (!kase) return <Loading />

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page">{kase.country.name_fr} — {kase.service.label_fr}</h1>
          <p className="hint">{kase.ref}{kase.university ? ` · ${kase.university}` : ''}
            {kase.application_deadline ? ` · échéance ${new Date(kase.application_deadline).toLocaleDateString('fr-FR')}` : ''}</p>
        </div>
        <StageBadge s={kase.stage} />
      </div>

      {kase.review_comment && <div className="card" style={{ marginBottom: 14 }}>
        <span className="badge orange">Message de l'agence</span> {kase.review_comment}</div>}

      <h2 className="section">Documents demandés</h2>
      <div className="tablewrap"><table className="tbl">
        <thead><tr><th>Document</th><th>Statut</th><th>Votre fichier</th><td></td></tr></thead>
        <tbody>{items.map((it) => (
          <tr key={it.id}>
            <td>
              <strong>{it.name_fr}</strong>
              {it.is_required && <span className="badge red">req.</span>}
              {it.translation_required && <span className="badge blue">traduction</span>}
              {it.legalisation_required && <span className="badge gold">{it.legalisation_mode ?? 'légalisation'}</span>}
            </td>
            <td><StatusBadge s={it.status} /></td>
            <td>{docs[it.id]
              ? <a href="#" onClick={(e) => { e.preventDefault(); download(docs[it.id]) }}>{docs[it.id].file_name}</a>
              : <span className="hint">aucun</span>}</td>
            <td style={{ textAlign: 'right' }}>
              <label className="btn ghost sm" style={{ margin: 0 }}>
                ⬆ Envoyer / Remplacer
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden
                  onChange={(e) => upload(it, e.target.files[0])} />
              </label>
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      <p style={{ marginTop: 16 }}><Link to="/portal">← Tous mes dossiers</Link></p>
    </>
  )
}
