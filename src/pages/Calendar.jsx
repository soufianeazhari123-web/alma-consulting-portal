import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loading } from '../components/ui'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

// Calendar of deadlines (cases) + task due dates for the visible scope.
// RLS scopes automatically; agents see their own cases.
// Local-time date key (never use toISOString — timezone shift bug)
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarPage() {
  const nav = useNavigate()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [events, setEvents] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    const [{ data: tasks }, { data: cases }] = await Promise.all([
      supabase.from('tasks').select('id,title,due_at,status').neq('status', 'cancelled'),
      supabase.from('cases').select('id,ref,application_deadline,student:students(full_name)')
        .neq('archived', true).not('application_deadline', 'is', null),
    ])
    setEvents({ tasks: tasks ?? [], cases: cases ?? [] })
  }

  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const startDow = (first.getDay() + 6) % 7 // Monday first
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.y, cursor.m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [cursor])

  if (!events) return <Loading />

  const dayEvents = (date) => {
    const iso = localISO(date)
    return [
      ...events.cases.filter((c) => c.application_deadline === iso)
        .map((c) => ({ type: 'deadline', label: `⏰ ${c.ref}`, id: c.id })),
      ...events.tasks.filter((t) => t.due_at && localISO(new Date(t.due_at)) === iso)
        .map((t) => ({ type: t.status === 'done' ? 'done' : 'task', label: t.title.slice(0, 22), id: t.id })),
    ]
  }

  return (
    <>
      <div className="topbar">
        <h1>Calendrier</h1>
        <div className="row">
          <button className="btn ghost sm" onClick={() =>
            cursor.m === 0 ? setCursor({ y: cursor.y - 1, m: 11 }) : setCursor({ ...cursor, m: cursor.m - 1 })}>◀</button>
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{MONTHS_FR[cursor.m]} {cursor.y}</strong>
          <button className="btn ghost sm" onClick={() =>
            cursor.m === 11 ? setCursor({ y: cursor.y + 1, m: 0 }) : setCursor({ ...cursor, m: cursor.m + 1 })}>▶</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d) =>
          <div key={d} className="hint" style={{ textAlign: 'center', fontWeight: 700 }}>{d}</div>)}
        {grid.map((date, i) => {
          if (!date) return <div key={i} />
          const evs = dayEvents(date)
          const today = date.toDateString() === new Date().toDateString()
          return (
            <div key={i} style={{
              background: '#fff', border: `1px solid ${today ? 'var(--gold)' : 'var(--line)'}`,
              borderRadius: 8, minHeight: 74, padding: 5, fontSize: 11.5,
            }}>
              <div style={{ fontWeight: 700, color: today ? 'var(--gold-contrast)' : undefined }}>{date.getDate()}</div>
              {evs.map((e, j) => (
                <div key={j}
                  onClick={() => e.type === 'deadline' && nav(`/cases/${e.id}`)}
                  style={{
                    marginTop: 2, padding: '1px 4px', borderRadius: 4, cursor: 'pointer',
                    background: e.type === 'deadline' ? '#fbe9e7' : e.type === 'done' ? '#e5f3ea' : '#e7eef8',
                    color: e.type === 'deadline' ? '#a52a21' : e.type === 'done' ? '#17603d' : '#27538c',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.label}</div>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
