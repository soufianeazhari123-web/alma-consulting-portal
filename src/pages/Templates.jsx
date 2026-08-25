import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Loading, Empty } from '../components/ui'

// Master checklist templates — Super Admin only (spec §15).
export default function Templates() {
  const [tpls, setTpls] = useState(null)
  const [open, setOpen] = useState(null) // template id -> items

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('service_templates')
      .select('*, country:countries(name_fr), service:service_types(label_fr)')
      .order('status').order('version', { ascending: false })
    setTpls(data ?? [])
  }

  async function openTpl(id) {
    if (open === id) return setOpen(null)
    const { data } = await supabase.from('document_templates')
      .select('*').eq('template_id', id).order('sort_order')
    setOpen([id, data ?? []])
  }

  if (!tpls) return <Loading />
  return (
    <>
      <div className="topbar"><h1>Modèles de checklists (maître)</h1></div>
      <p className="hint">Versionnés par pays et service. Les dossiers existants conservent leur version.
        Seul le Super Admin peut publier une nouvelle version.</p>
      <div className="tablewrap"><table className="tbl">
        <thead><tr><th>Pays</th><th>Service</th><th>Version</th><th>Statut</th><th>Publiée le</th></tr></thead>
        <tbody>{tpls.map((tp) => (
          <React.Fragment key={tp.id}>
            <tr className="clickable" onClick={() => openTpl(tp.id)}>
              <td><strong>{tp.country.name_fr}</strong></td>
              <td>{tp.service.label_fr}</td>
              <td>v{tp.version}</td>
              <td><span className={`badge ${tp.status === 'published' ? 'green' : tp.status === 'draft' ? 'orange' : 'gray'}`}>
                {tp.status}</span></td>
              <td className="hint">{tp.published_at ? new Date(tp.published_at).toLocaleDateString('fr-FR') : '—'}</td>
            </tr>
            {Array.isArray(open) && open[0] === tp.id && (
              <tr><td colSpan={5} style={{ background: '#fbfaf6' }}>
                <table className="tbl">
                  <thead><tr><th>#</th><th>Document</th><th>Obligatoire</th><th>Traduction</th><th>Légalisation</th><th>Mode</th></tr></thead>
                  <tbody>{open[1].map((it, i) => (
                    <tr key={it.id}>
                      <td>{i + 1}</td>
                      <td>{it.name_fr} <span className="hint">/ {it.name_en}</span></td>
                      <td>{it.is_required ? 'Oui' : 'Non'}</td>
                      <td>{it.translation_required ? 'Oui' : '—'}</td>
                      <td>{it.legalisation_required ? 'Oui' : '—'}</td>
                      <td className="hint">{it.legalisation_mode ?? ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </td></tr>
            )}
          </React.Fragment>
        ))}</tbody>
      </table></div>
    </>
  )
}
