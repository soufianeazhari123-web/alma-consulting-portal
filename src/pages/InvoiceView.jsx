import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'

// Renders an official INVOICE or RECEIPT by id (immutable data from DB).
// Print-ready via the browser (Ctrl+P) — @media print hides chrome.
export default function InvoiceView() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [doc, setDoc] = useState(null)
  const [kind, setKind] = useState(null)

  useEffect(() => { load() }, [id])
  async function load() {
    // receipt first (verify_payment returns receipt ids)
    let { data: r } = await supabase.from('receipts')
      .select('*, student:students(full_name,ref), agency:agencies(*), payment:payments(*), invoice:invoices(number,installment_no)')
      .eq('id', id).maybeSingle()
    if (r) {
      const { data: cfg } = await supabase.from('company_settings').select('*').maybeSingle()
      const { data: rule } = await supabase.from('installment_rules').select('label_fr').eq('id', r.invoice.installment_no).maybeSingle()
      setDoc({ ...r, cfg, ruleLabel: rule?.label_fr }); setKind('receipt'); return
    }
    const { data: i } = await supabase.from('invoices')
      .select('*, student:students(full_name,ref), agency:agencies(*)')
      .eq('id', id).single()
    if (i) {
      const { data: cfg } = await supabase.from('company_settings').select('*').maybeSingle()
      const { data: rule } = await supabase.from('installment_rules').select('label_fr').eq('id', i.installment_no).maybeSingle()
      const { data: pays } = await supabase.from('payments').select('amount,status').eq('invoice_id', i.id).eq('status', 'verified')
      setDoc({ ...i, cfg, ruleLabel: rule?.label_fr, paid: (pays ?? []).reduce((s, p) => s + Number(p.amount), 0) })
      setKind('invoice')
    }
  }

  if (!doc || !doc.cfg) return <p className="hint">…</p>
  const c = doc.cfg

  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        {kind === 'invoice' && profile?.role === 'super_admin' && doc.status === 'issued' && (
          <button className="btn ghost" onClick={async () => {
            const v = prompt('Nouveau montant (MAD) — motif obligatoire ensuite :', doc.amount)
            if (!v) return
            const reason = prompt('Motif de l’ajustement (obligatoire, audité) :')
            if (!reason?.trim()) return alert('Motif obligatoire.')
            try {
              await supabase.rpc('adjust_invoice_amount', {
                p_invoice: id, p_amount: Number(v), p_reason: reason.trim(),
              })
              load()
            } catch (ex) {
              alert(ex.message === 'REASON_MANDATORY' ? 'Motif obligatoire.'
                : ex.message === 'INVOICE_LOCKED_BY_PAYMENTS' ? 'Facture verrouillée : un paiement existe déjà.'
                : ex.message)
            }
          }}>✎ Ajuster le montant</button>
        )}
        <button className="btn primary" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
      </div>

      <div className="doc-sheet">
        <div className="doc-head">
          <div>
            <div className="mark">{c.legal_name}</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6 }}>
              {c.address_line1}, {c.city}, {c.country}<br />
              ICE : {c.ice} · IF : {c.tax_id} · RC : {c.rc_number}<br />
              {c.support_email}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: '4px 0', letterSpacing: 2 }}>
              {kind === 'receipt' ? 'REÇU OFFICIEL' : 'FACTURE'}
            </h2>
            <div><strong>{doc.number}</strong></div>
            <div style={{ fontSize: 12 }}>Émis le {new Date(doc.issued_at ?? doc.created_at).toLocaleDateString('fr-FR')}</div>
            {kind === 'invoice' && doc.due_date && <div style={{ fontSize: 12 }}>Échéance : {new Date(doc.due_date).toLocaleDateString('fr-FR')}</div>}
          </div>
        </div>

        <table style={{ width: '100%', fontSize: 13, marginBottom: 18 }}>
          <tbody>
            <tr><td style={{ color: '#6b7280', padding: '3px 0', width: 170 }}>Client</td>
              <td><strong>{doc.student.full_name}</strong> ({doc.student.ref})</td></tr>
            <tr><td style={{ color: '#6b7280', padding: '3px 0' }}>Agence</td>
              <td>{doc.agency.name}{doc.agency.city ? ` — ${doc.agency.city}` : ''}</td></tr>
            <tr><td style={{ color: '#6b7280', padding: '3px 0' }}>Objet</td>
              <td>{doc.ruleLabel ?? `Tranche ${doc.invoice?.installment_no ?? ''}`} — forfait services d’études à l’étranger</td></tr>
            {kind === 'receipt' && <>
              <tr><td style={{ color: '#6b7280', padding: '3px 0' }}>Facture liée</td><td>{doc.invoice.number}</td></tr>
              <tr><td style={{ color: '#6b7280', padding: '3px 0' }}>Moyen de paiement</td>
                <td>{doc.method === 'cash' ? 'Espèces' : 'Virement bancaire'} — vérifié et encaissé</td></tr>
              <tr><td style={{ color: '#6b7280', padding: '3px 0' }}>Vérifié par</td>
                <td>Directeur / Super Admin — {new Date(doc.payment?.verified_at ?? Date.now()).toLocaleString('fr-FR')}</td></tr>
            </>}
          </tbody>
        </table>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#f7f3e8' }}>
              <th style={{ textAlign: 'left', padding: 9, borderBottom: '2px solid #c9a227' }}>Désignation</th>
              <th style={{ textAlign: 'right', padding: 9, borderBottom: '2px solid #c9a227' }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 10, borderBottom: '1px solid #eee' }}>
                Tranche {kind === 'receipt' ? doc.invoice.installment_no : doc.installment_no}/4 —
                {' '}(forfait global : {Number(c.package_total).toLocaleString()} MAD en 4 tranches de 5 000 MAD)
              </td>
              <td style={{ textAlign: 'right', padding: 10, borderBottom: '1px solid #eee' }}>
                {Number(doc.amount).toLocaleString()} MAD
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'right', fontWeight: 700, padding: 10 }}>TOTAL</td>
              <td style={{ textAlign: 'right', fontWeight: 800, padding: 10, color: '#8a6d14' }}>
                {Number(doc.amount).toLocaleString()} MAD
              </td>
            </tr>
            {kind === 'invoice' && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', paddingBottom: 10 }}>
                  Déjà réglé sur cette facture : {Number(doc.paid ?? 0).toLocaleString()} MAD
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {kind === 'invoice' && (
          <div style={{ fontSize: 12, lineHeight: 1.7, marginTop: 22, borderTop: '1px dashed #ddd', paddingTop: 14 }}>
            <strong>Virement bancaire</strong> — {doc.agency.bank_name ?? '[Banque]'}
            {doc.agency.bank_iban && <> · IBAN/RIB : <strong>{doc.agency.bank_iban}</strong></>}
            {doc.agency.bank_account_holder && <> · Titulaire : {doc.agency.bank_account_holder}</>}<br />
            <strong>Espèces</strong> — paiement direct à l’agence {doc.agency.name}.
            Un reçu officiel numéroté sera délivré après vérification du directeur.
            <br /><em>TVA non applicable.</em>
          </div>
        )}
        {kind === 'receipt' && (
          <p style={{ marginTop: 26, fontStyle: 'italic' }}>
            Reçu certifiant que le paiement ci-dessus a été <strong>reçu et vérifié</strong>.
            Document généré électroniquement, numérotation séquentielle inaltérable.
          </p>
        )}
      </div>
    </>
  )
}
