import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Field } from '../components/ui'

// One application = one independent case (spec §6).
// Checklist auto-copied from the published country/service template (pinned version).
export default function NewCaseModal({ student, onClose, onSaved }) {
  const [countries, setCountries] = useState([])
  const [services, setServices] = useState([])
  const [tplOk, setTplOk] = useState(true)

  useEffect(() => {
    supabase.from('countries').select('id,name_fr').order('sort_order').then(({ data }) => setCountries(data ?? []))
    supabase.from('service_types').select('id,label_fr,key').eq('is_active', true).then(({ data }) => setServices(data ?? []))
  }, [])

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
      application_deadline: f.application_deadline || null,
      created_by: null, // set to caller via default? keep simple
    }).select('id').single()

    if (error) return alert(error.message)
    onSaved(created?.id)
  }

  return (
    <Modal title="Nouveau dossier de candidature" onClose={onClose} wide>
      {!tplOk && <p className="err">Aucun modèle publié pour ce pays/service — le dossier sera créé sans checklist. Contactez le Super Admin.</p>}
      <form onSubmit={submit}>
        <div className="grid c2">
          <Field label="Pays *">
            <select name="country_id" required>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
            </select>
          </Field>
          <Field label="Service *">
            <select name="service_type_id" required>
              {services.map((s) => <option key={s.id} value={s.id}>{s.label_fr}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Université / Institution"><input name="university" /></Field>
        <div className="grid c2">
          <Field label="Programme"><input name="program" /></Field>
          <Field label="Niveau"><input name="study_level" placeholder="Licence / Master / Doctorat" /></Field>
          <Field label="Rentrée"><input name="intake" placeholder="ex: Septembre 2027" /></Field>
          <Field label="Date limite"><input type="date" name="application_deadline" /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary">Créer le dossier</button>
        </div>
      </form>
    </Modal>
  )
}
