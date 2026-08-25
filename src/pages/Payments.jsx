import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty, StatusBadge } from '../components/ui'
import { exportCsv } from '../lib/csv'

// Cash & bank-transfer workflow (spec §11):
// staff record -> pending -> director verifies -> official receipt auto-issued.
export default function Payments() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const isDir = profile.role === 'director'
  const isSA = profile.role === 'super_admin'

  const [rows, setRows] = useState(null)
  const [openInvoices, setOpenInvoices] = useState([])
  const [add, setAdd] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const [{ data: pays }, { data: inv }] = await Promise.all([
      supabase.from('payments')
        .select('*, invoice:invoices(number), student:students(full_name)')
        .order('recorded_at', { ascending: false }).limit(100),
      supabase.from('invoices').select('*').neq('status', 'void')
        .in('status', ['issued', 'partially_paid'])
        .neq('amount', 0)
        .order('issued_at', { ascending: false }),
    ])
    setRows(pays ?? [])
    setOpenInvoices(inv ?? [])
  }

  async function verify(pay, approve) {
    let reason = null
    if (!approve) {
      reason = prompt('Motif du rejet :') ?? ''
      if (!reason.trim()) return
    } else if (!confirm(`Vérifier le paiement de ${Number(pay.amount).toLocaleString()} MAD ?\nLe reçu officiel sera généré immédiatement.`)) return
    try {
      const { data: receiptId, error } = await supabase.rpc('verify_payment', {
        p_payment: pay.id, p_approve: approve, p_reason: reason,
      })
      if (error) throw error
      if (receiptId) nav(`/invoices/${receiptId}`) // show printable receipt
      else load()
    } catch (ex) { alert(ex.message) }
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar">
        <h1>{t('payments')}</h1>
        <div className="row">
          <button className="btn ghost" onClick={() => exportCsv('paiements', 'payments', rows, [
            { label: 'Facture', get: (p) => p.invoice?.number },
            { label: 'Etudiant', get: (p) => p.student?.full_name },
            { label: 'Methode', get: (p) => p.method },
            { label: 'Montant', get: (p) => p.amount },
            { label: 'Devise', get: (p) => p.currency },
            { label: 'Statut', get: (p) => p.status },
          ])}>⬇ CSV</button>
          <button className="btn primary" disabled={openInvoices.length === 0}
            onClick={() => setAdd(true)}>+ Enregistrer un paiement</button>
        </div>
      </div>

      <div className="tablewrap"><table className="tbl">
        <thead><tr>
          <th>Facture</th><th>Étudiant</th><th>{t('method')}</th><th>{t('amount')}</th>
          <th>{t('status')}</th><th>Vérifié par</th><th className="no-print"></th>
        </tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}>
            <td><strong>{p.invoice?.number}</strong></td>
            <td>{p.student?.full_name}</td>
            <td>{p.method === 'cash' ? '💵 Espèces' : '🏦 Virement'}</td>
            <td>{Number(p.amount).toLocaleString()} MAD</td>
            <td><StatusBadge s={p.status} /></td>
            <td className="hint">{p.verified_by && p.status === 'verified' ? '✓' : p.rejection_reason || ''}</td>
            <td className="no-print row">
              {(isDir || isSA) && p.status === 'pending_verification' && <>
                <button className="btn ok sm" onClick={() => verify(p, true)}>✓ {t('verify')}</button>
                <button className="btn danger sm" onClick={() => verify(p, false)}>✕</button>
              </>}
              {p.status === 'verified' &&
                <button className="btn ghost sm" onClick={() => nav(`/invoices/${p.receipt_id}`)}>Reçu →</button>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      {add && <RecordPayment invoices={openInvoices} onClose={() => { setAdd(false); load() }} />}
    </>
  )
}

function RecordPayment({ invoices, onClose }) {
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '')
  const inv = invoices.find((i) => i.id === invoiceId)

  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    try {
      await supabase.rpc('record_payment', {
        p_invoice: invoiceId,
        p_method: f.method,
        p_amount: Number(f.amount),
        p_transfer_ref: f.transfer_ref || null,
        p_proof_path: null,
      })
      alert('Paiement enregistré — en attente de vérification par le directeur.')
      onClose()
    } catch (ex) { alert(ex.message) }
  }

  return (
    <Modal title="Enregistrer un paiement" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Facture *">
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} required>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} — tranche {i.installment_no} ({Number(i.amount).toLocaleString()} MAD)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Moyen *">
          <select name="method" required defaultValue="bank_transfer">
            <option value="cash">Espèces à l’agence</option>
            <option value="bank_transfer">Virement bancaire</option>
          </select>
        </Field>
        <Field label="Montant *">
          <input name="amount" type="number" step="0.01" min="1"
            max={inv ? Number(inv.amount) : undefined} required defaultValue={inv ? Number(inv.amount) : ''} />
        </Field>
        <Field label="Référence de virement (si applicable)">
          <input name="transfer_ref" placeholder="N° de transaction bancaire" />
        </Field>
        <p className="hint">{`⚠ Le reçu officiel n’est généré qu’après vérification par le directeur de l’agence.`}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  )
}
