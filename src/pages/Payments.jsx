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
  const [gen, setGen] = useState(false)

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
      reason = prompt(t('rejectReasonPrompt')) ?? ''
      if (!reason.trim()) return
    } else if (!confirm(t('verifyConfirm'))) return
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
            { label: t('invoiceCol'), get: (p) => p.invoice?.number },
            { label: t('students'), get: (p) => p.student?.full_name },
            { label: t('method'), get: (p) => p.method },
            { label: t('amount'), get: (p) => p.amount },
            { label: 'MAD', get: (p) => p.currency },
            { label: t('status'), get: (p) => p.status },
          ])}>{t('csv')}</button>
          <button className="btn ghost" title={t('remindersHint')}
            onClick={async () => {
              try {
                const { data: n } = await supabase.rpc('draft_installment_reminders')
                alert(`${n ?? 0} ${t('remindersDone')}`)
              } catch (ex) { alert(ex.message) }
            }}>{t('remindersBtn')}</button>
          <button className="btn ghost" onClick={() => setGen(true)}>+ {t('generateInvoice') || 'Générer facture'}</button>
          <button className="btn primary" disabled={openInvoices.length === 0}
            onClick={() => setAdd(true)}>{t('recordPayment')}</button>
        </div>
      </div>

      <div className="tablewrap"><table className="tbl">
        <thead><tr>
          <th>{t('invoiceCol')}</th><th>{t('students')}</th><th>{t('method')}</th><th>{t('amount')}</th>
          <th>{t('status')}</th><th>{t('verifiedBy')}</th><th className="no-print"></th>
        </tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}>
            <td><strong>{p.invoice?.number}</strong></td>
            <td>{p.student?.full_name}</td>
            <td>{p.method === 'cash' ? t('cashLabel') : t('transferLabel')}</td>
            <td>{Number(p.amount).toLocaleString()} MAD</td>
            <td><StatusBadge s={p.status} /></td>
            <td className="hint">{p.verified_by && p.status === 'verified' ? '✓' : p.rejection_reason || ''}</td>
            <td className="no-print row">
              {(isDir || isSA) && p.status === 'pending_verification' && <>
                <button className="btn ok sm" onClick={() => verify(p, true)}>✓ {t('verify')}</button>
                <button className="btn danger sm" onClick={() => verify(p, false)}>✕</button>
              </>}
              {p.status === 'verified' &&
                <button className="btn ghost sm" onClick={() => nav(`/invoices/${p.receipt_id}`)}>{t('receiptLink')}</button>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      {add && <RecordPayment invoices={openInvoices} onClose={() => { setAdd(false); load() }} />}
      {gen && <GenerateInvoice onClose={() => { setGen(false); load() }} />}
    </>
  )
}

function GenerateInvoice({ onClose }) {
  const { t } = useLang()
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [installment, setInstallment] = useState('1')
  useEffect(() => { supabase.from('students').select('id,full_name,ref').eq('is_archived', false).order('full_name').limit(100).then(({ data }) => setStudents(data ?? [])) }, [])
  async function submit(e) {
    e.preventDefault()
    try {
      const { data: invId, error } = await supabase.rpc('issue_invoice_for_student', { p_student: studentId, p_installment: Number(installment) })
      if (error) throw error
      alert(`${t('invoiceGenerated') || 'Facture générée'}: ${invId}`)
      onClose()
    } catch (ex) { alert(ex.message) }
  }
  return (
    <Modal title={t('generateInvoice') || 'Générer une facture'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={`${t('students')} *`}>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">—</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.ref})</option>)}
          </select>
        </Field>
        <Field label="Tranche *">
          <select value={installment} onChange={(e) => setInstallment(e.target.value)} required>
            <option value="1">Tranche 1 — Inscription</option>
            <option value="2">Tranche 2 — Université</option>
            <option value="3">Tranche 3 — Visa/TRP</option>
            <option value="4">Tranche 4 — Rendez-vous</option>
          </select>
        </Field>
        <p className="hint">{t('receiptAfterVerify')}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function RecordPayment({ invoices, onClose }) {
  const { t, lang } = useLang()
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '')
  const inv = invoices.find((i) => i.id === invoiceId)

  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    try {
      await supabase.rpc('record_payment', {
        p_invoice: invoiceId,
        p_method: f.method,
        // Q1: full installment amount only — enforced again server-side
        p_amount: Number(f.amount),
        p_transfer_ref: f.transfer_ref || null,
        p_proof_path: null,
      })
      alert(t('recordedPending'))
      onClose()
    } catch (ex) {
      const msgs = {
        FULL_AMOUNT_REQUIRED: t('fullAmountRequired'),
        PAYMENT_ALREADY_PENDING: t('alreadyPending'),
      }
      alert(msgs[ex.message] ?? ex.message)
    }
  }

  return (
    <Modal title={t('recordPaymentTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={`${t('invoiceCol')} *`}>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} required>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} — {t('installmentOf')} {i.installment_no} ({Number(i.amount).toLocaleString()} MAD)
              </option>
            ))}
          </select>
        </Field>
        <Field label={`${t('method')} *`}>
          <select name="method" required defaultValue="bank_transfer">
            <option value="cash">{t('cashOption')}</option>
            <option value="bank_transfer">{t('transferOption')}</option>
          </select>
        </Field>
        <Field label={t('openBalanceExact')}>
          <input name="amount" type="number" step="0.01" min="1"
            max={inv ? Number(inv.amount) : undefined} required defaultValue={inv ? Number(inv.amount) : ''} />
        </Field>
        <Field label={t('transferRef')}>
          <input name="transfer_ref" placeholder={t('transferRefPh')} />
        </Field>
        <p className="hint">{t('receiptAfterVerify')}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  )
}
