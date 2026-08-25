import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Field } from '../components/ui'

// Company legal details + installment rules — Super Admin only.
export default function SettingsPage() {
  const { profile } = useAuth()
  const [cfg, setCfg] = useState(null)
  const [rules, setRules] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('company_settings').select('*').maybeSingle(),
      supabase.from('installment_rules').select('*').order('id'),
    ])
    setCfg(c); setRules(r ?? [])
  }

  async function saveSettings(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    const { error } = await supabase.from('company_settings').update({
      legal_name: f.legal_name, address_line1: f.address_line1, city: f.city,
      country: f.country, ice: f.ice, tax_id: f.tax_id, rc_number: f.rc_number,
      support_email: f.support_email, support_phone: f.support_phone,
      invoice_due_days: Number(f.invoice_due_days),
      updated_by: profile.id,
    }).eq('id', true)
    if (error) alert(error.message); else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  if (!cfg) return null
  return (
    <>
      <div className="topbar"><h1>Paramètres société</h1></div>
      <form onSubmit={saveSettings} className="card" style={{ maxWidth: 720 }}>
        <div className="grid c2">
          <Field label="Raison sociale"><input name="legal_name" defaultValue={cfg.legal_name} /></Field>
          <Field label="Ville"><input name="city" defaultValue={cfg.city} /></Field>
          <Field label="Adresse"><input name="address_line1" defaultValue={cfg.address_line1} /></Field>
          <Field label="Pays"><input name="country" defaultValue={cfg.country} /></Field>
          <Field label="ICE"><input name="ice" defaultValue={cfg.ice} /></Field>
          <Field label="IF"><input name="tax_id" defaultValue={cfg.tax_id} /></Field>
          <Field label="RC"><input name="rc_number" defaultValue={cfg.rc_number} /></Field>
          <Field label="Email support"><input name="support_email" defaultValue={cfg.support_email} /></Field>
          <Field label="Téléphone"><input name="support_phone" defaultValue={cfg.support_phone} /></Field>
          <Field label="Délai facture (jours)"><input type="number" name="invoice_due_days" defaultValue={cfg.invoice_due_days} /></Field>
        </div>
        <button className="btn primary">{saved ? '✓ Enregistré' : 'Enregistrer'}</button>
      </form>

      <h2 className="section">Déclencheurs de tranches (facturation)</h2>
      <div className="card" style={{ maxWidth: 760 }}>
        <table className="tbl">
          <thead><tr><th>#</th><th>Déclenché à l’étape</th><th>Périmètre</th><th>Montant</th><th>Libellé</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.id}</strong></td>
              <td><code>{r.trigger_stage}</code></td>
              <td>{r.service_scope}</td>
              <td>{Number(r.default_amount).toLocaleString()} MAD</td>
              <td className="hint">{r.label_fr}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="hint" style={{ marginTop: 10 }}>
          Rappel politique propriétaire : après un refus de visa/TRP, la 2ᵉ tentative est
          <strong> entièrement gratuite</strong> — aucun invoice n’est émis pour les dossiers « free retake ».
        </p>
      </div>
    </>
  )
}
