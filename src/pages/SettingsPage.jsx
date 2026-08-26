import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Field } from '../components/ui'

// Company legal details + installment rules — Super Admin only.
export default function SettingsPage() {
  const { profile } = useAuth()
  const { t } = useLang()
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
      <div className="topbar"><h1>{t('companySettings')}</h1></div>
      <form onSubmit={saveSettings} className="card" style={{ maxWidth: 720 }}>
        <div className="grid c2">
          <Field label={t('legalName')}><input name="legal_name" defaultValue={cfg.legal_name} /></Field>
          <Field label={t('city')}><input name="city" defaultValue={cfg.city} /></Field>
          <Field label={t('addr')}><input name="address_line1" defaultValue={cfg.address_line1} /></Field>
          <Field label={t('country')}><input name="country" defaultValue={cfg.country} /></Field>
          <Field label={t('ice')}><input name="ice" defaultValue={cfg.ice} /></Field>
          <Field label={t('taxId')}><input name="tax_id" defaultValue={cfg.tax_id} /></Field>
          <Field label={t('rcNumber')}><input name="rc_number" defaultValue={cfg.rc_number} /></Field>
          <Field label={t('supportEmail')}><input name="support_email" defaultValue={cfg.support_email} /></Field>
          <Field label={t('supportPhone')}><input name="support_phone" defaultValue={cfg.support_phone} /></Field>
          <Field label={t('invoiceDueDays')}><input type="number" name="invoice_due_days" defaultValue={cfg.invoice_due_days} /></Field>
        </div>
        <button className="btn primary">{saved ? t('saved') : t('save')}</button>
      </form>

      <h2 className="section">{t('installmentTriggers')}</h2>
      <div className="card" style={{ maxWidth: 760 }}>
        <table className="tbl">
          <thead><tr>
            <th>#</th><th>{t('triggerStage')}</th><th>{t('scopeCol')}</th>
            <th>{t('amount')}</th><th>{t('labelCol')}</th>
          </tr></thead>
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
        <p className="hint" style={{ marginTop: 10 }}>{t('retakeNote')}</p>
      </div>
    </>
  )
}
