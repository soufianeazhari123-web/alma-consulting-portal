import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty } from '../components/ui'

// Super Admin only (route-guarded). Directors/agents read their own agency via RLS.
export default function Agencies() {
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null) // null | {} | agency

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('agencies').select('*').order('name')
    setRows(data ?? [])
  }

  async function save(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    const payload = {
      name: f.name, city: f.city, address: f.address, phone: f.phone, email: f.email,
      bank_name: f.bank_name, bank_account_holder: f.bank_account_holder,
      bank_iban: f.bank_iban, bank_instructions: f.bank_instructions,
      invoice_prefix: f.invoice_prefix.toUpperCase(), is_active: f.is_active === 'on',
    }
    const { error } = edit.id
      ? await supabase.from('agencies').update(payload).eq('id', edit.id)
      : await supabase.from('agencies').insert(payload)
    if (error) return alert(error.message)
    setEdit(null); load()
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar">
        <h1 className="page">{t('teamAgencies')} — {t('agency')}</h1>
        <button className="btn primary" onClick={() => setEdit({})}>+ {t('addAgency')}</button>
      </div>
      {rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('agency')}</th><th>Ville</th><th>Préfixe</th><th>Banque</th><th>{t('status')}</th><th></th>
          </tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.name}</strong></td>
              <td>{a.city}</td>
              <td><span className="badge gold">{a.invoice_prefix}</span></td>
              <td>{a.bank_name || '—'}</td>
              <td>{a.is_active ? <span className="badge green">{t('active')}</span> : <span className="badge gray">{t('inactive')}</span>}</td>
              <td><button className="btn ghost sm" onClick={() => setEdit(a)}>✎</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {edit && (
        <Modal title={edit.id ? t('agency') : t('addAgency')} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <Field label="Nom *"><input name="name" required defaultValue={edit.name} /></Field>
            <div className="grid c2">
              <Field label="Ville"><input name="city" defaultValue={edit.city} /></Field>
              <Field label="Téléphone"><input name="phone" defaultValue={edit.phone} /></Field>
            </div>
            <Field label="Adresse"><input name="address" defaultValue={edit.address} /></Field>
            <Field label="Email public"><input name="email" type="email" defaultValue={edit.email} /></Field>
            <h2 className="section">Coordonnées bancaires (protégées)</h2>
            <div className="grid c2">
              <Field label="Banque"><input name="bank_name" defaultValue={edit.bank_name} /></Field>
              <Field label="Titulaire du compte"><input name="bank_account_holder" defaultValue={edit.bank_account_holder} /></Field>
            </div>
            <Field label="IBAN / RIB"><input name="bank_iban" defaultValue={edit.bank_iban} /></Field>
            <Field label="Instructions de virement"><textarea name="bank_instructions" rows={2} defaultValue={edit.bank_instructions} /></Field>
            <div className="grid c2">
              <Field label="Préfixe facture (ex OUJ) *"><input name="invoice_prefix" required maxLength={5}
                defaultValue={edit.invoice_prefix} /></Field>
              <Field label="Active">
                <label style={{ display:'flex', gap:8, alignItems:'center', fontWeight:400 }}>
                  <input type="checkbox" name="is_active" defaultChecked={edit.id ? edit.is_active : true} style={{width:'auto'}} />
                  Agence active
                </label>
              </Field>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t('cancel')}</button>
              <button className="btn primary">{t('save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// Staff management (SA: all agencies / Director: own agency — enforced by RLS + fn)
export { default as StaffInner } from './Staff'
