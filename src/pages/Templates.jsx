import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { Loading, Empty } from '../components/ui'

// Master checklist templates — Super Admin only (spec §15).
export default function Templates() {
  const { t, lang } = useLang()
  const [tpls, setTpls] = useState(null)
  const [open, setOpen] = useState(null) // [id, items]

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('service_templates')
      .select('*, country:countries(name_fr,name_en), service:service_types(label_fr,label_en)')
      .order('status').order('version', { ascending: false })
    setTpls(data ?? [])
  }

  async function openTpl(id) {
    if (Array.isArray(open) && open[0] === id) return setOpen(null)
    const { data } = await supabase.from('document_templates')
      .select('*').eq('template_id', id).order('sort_order')
    setOpen([id, data ?? []])
  }

  if (!tpls) return <Loading />
  return (
    <>
      <div className="topbar"><h1>{t('tplTitle')}</h1></div>
      <p className="hint">{t('tplNote')}</p>
      <div className="tablewrap"><table className="tbl">
        <thead><tr>
          <th>{t('country')}</th><th>{t('service')}</th><th>{t('versionCol')}</th><th>{t('status')}</th><th>{t('publishedOn')}</th>
        </tr></thead>
        <tbody>{tpls.map((tp) => (
          <React.Fragment key={tp.id}>
            <tr className="clickable" onClick={() => openTpl(tp.id)}>
              <td><strong>{lang==='ar'?tp.country.name_en:tp.country.name_fr}</strong></td>
              <td>{lang==='ar'?tp.service.label_en:tp.service.label_fr}</td>
              <td>v{tp.version}</td>
              <td><span className={`badge ${tp.status === 'published' ? 'green' : tp.status === 'draft' ? 'orange' : 'gray'}`}>
                {tp.status}</span></td>
              <td className="hint">{tp.published_at ? new Date(tp.published_at).toLocaleDateString(lang==='ar'?'ar-MA':lang==='en'?'en-GB':'fr-FR') : '—'}</td>
            </tr>
            {Array.isArray(open) && open[0] === tp.id && (
              <tr><td colSpan={5} style={{ background: '#fbfaf6' }}>
                <table className="tbl">
                  <thead><tr>
                    <th>#</th><th>{t('document')}</th><th>{t('required')}</th>
                    <th>{t('translation')}</th><th>{t('legalisation')}</th><th>{t('modeCol')}</th>
                  </tr></thead>
                  <tbody>{open[1].map((it, i) => (
                    <tr key={it.id}>
                      <td>{i + 1}</td>
                      <td>{it.name_fr} <span className="hint">/ {it.name_en}</span></td>
                      <td>{it.is_required ? t('yes') : t('optional')}</td>
                      <td>{it.translation_required ? t('yes') : t('none')}</td>
                      <td>{it.legalisation_required ? t('yes') : t('none')}</td>
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

