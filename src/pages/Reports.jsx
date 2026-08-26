import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'

// Q18: in-app printable weekly owner/director report.
function mondayOf(d) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x
}

export default function Reports() {
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()))
  const [data, setData] = useState(null)

  useEffect(() => { load() }, [weekStart])
  async function load() {
    const end = new Date(weekStart); end.setDate(end.getDate() + 7)
    const s = weekStart.toISOString(); const e = end.toISOString()

    const [{ count: newStudents }, { count: newCases }, stageCounts,
      { data: pays }, { count: overdueTasks }, { data: queue }] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).gte('enrolled_at', s).lt('enrolled_at', e),
      supabase.from('cases').select('id', { count: 'exact', head: true }).gte('created_at', s).lt('created_at', e),
      supabase.from('cases').select('stage', { count: 'exact' }).neq('archived', true),
      supabase.from('payments').select('amount,status,verified_at,recorded_at'),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done')
        .lt('due_at', new Date().toISOString()),
      supabase.from('cases').select('id,ref,marked_ready_at,student:students(full_name)')
        .eq('stage', 'ready_for_review'),
    ])

    const byStage = {}
    for (const row of stageCounts.data ?? []) byStage[row.stage] = (byStage[row.stage] ?? 0) + 1
    const verifiedWeek = (pays ?? []).filter((p) => p.status === 'verified' && p.verified_at >= s && p.verified_at < e)
    setData({
      newStudents, newCases, byStage,
      collected: verifiedWeek.reduce((a, p) => a + Number(p.amount), 0),
      pendingVerifs: (pays ?? []).filter((p) => p.status === 'pending_verification'),
      overdueTasks, queue,
    })
  }

  if (!data) return <p className="hint">…</p>
  return (
    <>
      <div className="topbar">
        <h1>Rapport hebdomadaire</h1>
        <div className="row no-print">
          <input type="date" value={new Date(weekStart).toISOString().slice(0, 10)}
            onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value)))} />
          <button className="btn primary" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
        </div>
      </div>

      <div className="doc-sheet">
        <div className="doc-head">
          <div><div className="mark">ALMA CONSULTING</div>
            <div style={{ fontSize: 12 }}>Rapport du {weekStart.toLocaleDateString('fr-FR')} au
              {' '}{new Date(new Date(weekStart).setDate(weekStart.getDate() + 6)).toLocaleDateString('fr-FR')}</div></div>
        </div>

        <div className="grid c3" style={{ marginTop: 14 }}>
          <div className="card stat"><div className="k">Nouveaux étudiants</div><div className="v">{data.newStudents}</div></div>
          <div className="card stat"><div className="k">Nouveaux dossiers</div><div className="v">{data.newCases}</div></div>
          <div className="card stat gold"><div className="k">Encaissé vérifié (semaine)</div><div className="v">{data.collected.toLocaleString()} MAD</div></div>
          <div className="card stat"><div className="k">Paiements à vérifier</div><div className="v">{data.pendingVerifs.length}</div></div>
          <div className="card stat"><div className="k">Tâches en retard</div><div className="v">{data.overdueTasks}</div></div>
          <div className="card stat"><div className="k">File de révision</div><div className="v">{data.queue.length}</div></div>
        </div>

        <h2 className="section">Dossiers par étape</h2>
        <table className="tbl"><tbody>
          {Object.entries(data.byStage).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
            <tr key={st}><td>{st.replaceAll('_', ' ')}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{n}</td></tr>
          ))}
        </tbody></table>

        {data.queue.length > 0 && <>
          <h2 className="section">En attente de votre révision</h2>
          <ul>{data.queue.map((c) => (
            <li key={c.id}>{c.ref} — {c.student?.full_name} — depuis le {new Date(c.marked_ready_at).toLocaleDateString('fr-FR')}</li>
          ))}</ul>
        </>}
      </div>
    </>
  )
}
