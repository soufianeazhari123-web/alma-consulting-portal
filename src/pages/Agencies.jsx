import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty } from '../components/ui'

// Super Admin only (route-guarded). Directors/agents read their own
// agency via RLS. SA may add, edit, ARCHIVE and (if empty) DELETE agencies.
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

  // SA right #1: archive / unarchive (keeps all history)
  async function toggleArchive(a) {
    const msg = a.is_active ? t('archiveConfirm') : t('unarchiveConfirm')
    if (!confirm(msg)) return
    const { error } = await supabase.from('agencies').update({ is_active: !a.is_active }).eq('id', a.id)
    if (error) return alert(error.message)
    load()
  }

  // SA right #2: hard delete — typed DELETE + only when agency has no dependents
  async function remove(a) {
    if (!confirm(t('deleteConfirm'))) return
    const answer = prompt(t('typeDelete'))
    if (answer?.trim().toUpperCase() !== 'DELETE') {
      alert(t('reasonRequiredAlert'))
      return
    }

    // Pre-check dependents for a friendly message (server FK still guards)
    const [st, pr, ca] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
      supabase.from('cases').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
    ])
    const total = (st.count ?? 0) + (pr.count ?? 0) + (ca.count ?? 0)
    if (total > 0) {
      alert(`${t('deleteHasData')} (${total})`)
      return
    }
    const { error } = await supabase.from('agencies').delete().eq('id', a.id)
    if (error) return alert(error.message.includes('foreign key') ? t('deleteHasData') : error.message)
    load()
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar">
        <h1 className="page">{t('teamAgencies')}</h1>
        <button className="btn primary" onClick={() => setEdit({})}>{t('addAgency')}</button>
      </div>
      {rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('agency')}</th><th>{t('cityLbl')}</th><th>Préfixe</th>
            <th>{t('bank')}</th><th>{t('status')}</th><th>{t('actions')}</th>
          </tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id} style={!a.is_active ? { opacity: .55 } : undefined}>
              <td><strong>{a.name}</strong></td>
              <td>{a.city}</td>
              <td><span className="badge gold">{a.invoice_prefix}</span></td>
              <td>{a.bank_name || '—'}</td>
              <td>{a.is_active ? <span className="badge green">{t('active')}</span> : <span className="badge gray">{t('inactive')}</span>}</td>
              <td className="row no-print">
                <button className="btn ghost sm" title={t('editDetails')} onClick={() => setEdit(a)}>✎</button>
                <button className="btn ghost sm" onClick={() => toggleArchive(a)}>
                  {a.is_active ? t('archive') : t('unarchive')}
                </button>
                <button className="btn danger sm" onClick={() => remove(a)}>{t('deleteAgency')}</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {edit && (
        <Modal title={edit.id ? `${t('agency')} — ${edit.name}` : t('addAgency')} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <Field label={t('agencyName')}><input name="name" required defaultValue={edit.name} /></Field>
            <div className="grid c2">
              <Field label={t('cityLbl')}><input name="city" defaultValue={edit.city} /></Field>
              <Field label={t('phoneLbl')}><input name="phone" defaultValue={edit.phone} /></Field>
            </div>
            <Field label={t('addressLbl')}><input name="address" defaultValue={edit.address} /></Field>
            <Field label={t('publicEmail')}><input name="email" type="email" defaultValue={edit.email} /></Field>
            <h2 className="section">{t('bankSection')}</h2>
            <div className="grid c2">
              <Field label={t('bankName')}><input name="bank_name" defaultValue={edit.bank_name} /></Field>
              <Field label={t('accountHolder')}><input name="bank_account_holder" defaultValue={edit.bank_account_holder} /></Field>
            </div>
            <Field label={t('iban')}><input name="bank_iban" defaultValue={edit.bank_iban} /></Field>
            <Field label={t('transferInstr')}><textarea name="bank_instructions" rows={2} defaultValue={edit.bank_instructions} /></Field>
            <div className="grid c2">
              <Field label={t('prefixLbl')}><input name="invoice_prefix" required maxLength={5}
                defaultValue={edit.invoice_prefix} /></Field>
              <Field label={t('active')}>
                <label style={{ display:'flex', gap:8, alignItems:'center', fontWeight:400 }}>
                  <input type="checkbox" name="is_active" defaultChecked={edit.id ? edit.is_active : true} style={{width:'auto'}} />
                  {t('activeAgency')}
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
