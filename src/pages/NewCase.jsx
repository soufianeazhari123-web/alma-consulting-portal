import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty } from '../components/ui'

// One application = one independent case (spec §6).
// When the agent selects a country (+ service), the published master
// checklist appears INSTANTLY as a preview; it is then copied to the
// case server-side (version pinned) on creation.
export default function NewCaseModal({ student, onClose, onSaved }) {
  const { t } = useLang()
  const [countries, setCountries] = useState(null)
  const [services, setServices] = useState([])
  const [countryId, setCountryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [preview, setPreview] = useState(null) // null = loading | [] = none | items
  const [tplOk, setTplOk] = useState(true)

  useEffect(() => {
    supabase.from('countries').select('id,name_fr,name_en,code').order('sort_order')
      .then(({ data }) => setCountries(data ?? []))
    supabase.from('service_types').select('id,label_fr,label_en,key').eq('is_active', true)
      .then(({ data }) => setServices(data ?? []))
  }, [])

  // Live checklist preview whenever country or service changes
  useEffect(() => {
    if (!countryId || !serviceId) return setPreview(null)
    let live = true
    setPreview(null); setTplOk(true)
    ;(async () => {
      const { data: tpl } = await supabase.from('service_templates')
        .select('id,version,status')
        .eq('country_id', countryId).eq('service_type_id', serviceId)
        .eq('status', 'published').order('version', { ascending: false }).limit(1).maybeSingle()
      if (!live) return
      if (!tpl) { setPreview([]); setTplOk(false); return }
      const { data: items } = await supabase.from('document_templates')
        .select('name_fr,name_en,is_required,translation_required,legalisation_required,legalisation_mode')
        .eq('template_id', tpl.id).order('sort_order')
      if (!live) return
      setPreview(items ?? [])
    })()
    return () => { live = false }
  }, [countryId, serviceId])

  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))

    const { data: tpl } = await supabase.from('service_templates')
      .select('id,status').eq('country_id', f.country_id).eq('service_type_id', f.service_type_id)
      .eq('status', 'published').limit(1).maybeSingle()
    if (!tpl) setTplOk(false)

    const { data: created, error } = await supabase.from('cases').insert({
      student_id: student.id,
      agency_id: student.agency_id,
      agent_id: student.main_agent_id,
      country_id: f.country_id,
      service_type_id: f.service_type_id,
      university: f.university || null,
      program: f.program || null,
      study_level: f.study_level || null,
      intake: f.intake || null,
      intake_month: f.intake_month || null,
      application_deadline: f.application_deadline || null,
    }).select('id').single()

    if (error) return alert(error.message)
    onSaved(created?.id)
  }

  if (!countries) return <Modal title={t('loading')} onClose={onClose}><Loading /></Modal>

  const flag = (c) => c.code ? ` ${c.code}` : ''

  return (
    <Modal title={t('newCaseTitle')} onClose={onClose} wide>
      {!tplOk && countryId && serviceId && <p className="err">{t('noTemplateWarn')}</p>}
      <form onSubmit={submit}>
        <div className="grid c2">
          <Field label={`${t('country')} *`}>
            <select name="country_id" required value={countryId}
              onChange={(e) => setCountryId(e.target.value)}>
              <option value="">—</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {{LT:'🇱🇹',LV:'🇱🇻',EE:'🇪🇪',HU:'🇭🇺',PL:'🇵🇱',ES:'🇪🇸',FR:'🇫🇷',DE:'🇩🇪',BE:'🇧🇪',NL:'🇳🇱'}[c.code] || ''} {t('lang')==='ar'?c.name_en:c.name_fr}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`${t('service')} *`}>
            <select name="service_type_id" required value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}>
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{t('lang')==='ar' ? s.label_en : s.label_fr}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Automatic checklist preview */}
        {(countryId && serviceId) && (
          <div className="card" style={{ background:'#fbfaf5', marginBottom:12 }}>
            <strong style={{ fontSize:13 }}>📋 {t('checklistPreview')}</strong>
            {preview === null ? <Loading /> : preview.length === 0 ? (
              <Empty msg={t('noTemplateWarn')} />
            ) : (
              <table className="tbl" style={{ marginTop:8 }}>
                <thead><tr>
                  <th>{t('document')}</th><th>{t('status')}</th>
                  <th>{t('translation')}</th><th>{t('legalisation')}</th>
                </tr></thead>
                <tbody>{preview.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name_fr}{it.name_en !== it.name_fr && <> <span className="hint">/ {it.name_en}</span></>}</td>
                    <td>{it.is_required
                      ? <span className="badge red">{t('required')}</span>
                      : <span className="badge gray">{t('optional')}</span>}</td>
                    <td>{it.translation_required ? t('yes') : t('none')}</td>
                    <td>{it.legalisation_required ? (it.legalisation_mode || '✓') : t('none')}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        <Field label={t('university')}><input name="university" /></Field>
        <div className="grid c2">
          <Field label={t('program')}><input name="program" /></Field>
          <Field label={t('level')}><input name="study_level" placeholder="Licence / Master / Doctorat" /></Field>
          <Field label={t('intakeFree')}><input name="intake" placeholder="ex: Septembre 2027" /></Field>
          <Field label={t('season')}>
            <select name="intake_month" defaultValue="">
              <option value="">—</option>
              <option value="september">{t('seasonSept')}</option>
              <option value="february">{t('seasonFeb')}</option>
            </select>
          </Field>
          <Field label={t('deadline')}><input type="date" name="application_deadline" /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={!countryId || !serviceId}>{t('createCase')}</button>
        </div>
      </form>
    </Modal>
  )
}
