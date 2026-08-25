import React from 'react'

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

const stageColors = {
  draft: 'gray', documents_in_progress: 'blue', ready_for_review: 'gold',
  changes_requested: 'orange', approved_for_submission: 'green', appointment_booked: 'blue',
  submitted: 'gold', biometrics_interview: 'blue', additional_info_requested: 'orange',
  accepted: 'green', rejected: 'red', withdrawn: 'gray', closed: 'gray',
  visa_approved: 'green', visa_refused: 'red',
}
export const StageBadge = ({ s }) => <span className={`badge ${stageColors[s] || 'gray'}`}>{s.replaceAll('_',' ')}</span>

export function StatusBadge({ s }) {
  const map = {
    pending_verification: ['orange', '⏳'], verified: ['green','✓'], rejected: ['red','✕'],
    issued: ['blue',''], paid: ['green','✓'], partially_paid: ['orange','~'], void: ['gray','∅'],
    not_requested: ['gray',''], requested: ['blue','…'], uploaded: ['blue','↑'],
    under_review: ['gold','…'], changes_requested: ['orange','!'], approved: ['green','✓'],
    waived: ['gray','—'], expired: ['red','⚠'], superseded: ['gray','↻'],
    todo: ['gray',''], in_progress: ['blue','…'], done: ['green','✓'], cancelled: ['gray','✕'],
  }
  const [cls, icon] = map[s] || ['gray','']
  return <span className={`badge ${cls}`}>{icon} {s.replaceAll('_',' ')}</span>
}

export function ReadinessMeter({ score = 0 }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div className="meter"><div style={{ width: `${score}%` }} /></div>
      <small className="hint">{score}%</small>
    </div>
  )
}

export function Empty({ msg }) { return <p className="hint" style={{ padding: 18 }}>{msg}</p> }
export function Loading() { return <p className="hint" style={{ padding: 18 }}>…</p> }
