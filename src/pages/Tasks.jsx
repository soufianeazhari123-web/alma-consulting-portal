import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty, StatusBadge } from '../components/ui'

export default function Tasks() {
  const { profile } = useAuth()
  const { t } = useLang()
  const [rows, setRows] = useState(null)
  const [view, setView] = useState('mine') // mine | agency | overdue
  const [add, setAdd] = useState(false)

  useEffect(() => { load() }, [view])
  async function load() {
    let q = supabase.from('tasks')
      .select('*, assignee_p:profiles!tasks_assignee_fkey(full_name), student:students(full_name)')
      .order('due_at', { ascending: true, nullsFirst: false })
    if (view === 'mine' && profile.role !== 'super_admin') q = q.eq('assignee', profile.id)
    if (view === 'overdue') q = q.neq('status', 'done').lt('due_at', new Date().toISOString())
    else q = q.neq('status', 'cancelled')
    const { data } = await q
    setRows(data ?? [])
  }

  async function toggleDone(task) {
    const done = task.status !== 'done'
    await supabase.from('tasks').update({
      status: done ? 'done' : 'todo',
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? profile.id : null,
    }).eq('id', task.id)
    load()
  }

  return (
    <>
      <div className="topbar">
        <h1>{t('tasks')}</h1>
        <div className="row">
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="mine">Mes tâches</option>
            <option value="all">{profile.role === 'super_admin' ? 'Toutes (société)' : 'Agence'}</option>
            <option value="overdue">En retard</option>
          </select>
          <button className="btn primary" onClick={() => setAdd(true)}>+ Nouvelle tâche</button>
        </div>
      </div>

      {!rows ? <Loading /> : rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th></th><th>Tâche</th><th>Étudiant</th><th>Assignée à</th><th>Échéance</th><th>Priorité</th></tr></thead>
          <tbody>{rows.map((task) => {
            const late = task.due_at && task.status !== 'done' && new Date(task.due_at) < new Date()
            return (
              <tr key={task.id}>
                <td><input type="checkbox" checked={task.status === 'done'} style={{ width: 'auto' }}
                  onChange={() => toggleDone(task)} /></td>
                <td><strong style={task.status === 'done' ? { textDecoration: 'line-through', opacity: .55 } : null}>
                  {task.title}</strong></td>
                <td>{task.student?.full_name ?? '—'}</td>
                <td>{task.assignee_p?.full_name ?? '—'}</td>
                <td>{late ? <span className="badge red">⚠ {t('overdue')}</span> : null}
                  {' '}{task.due_at ? new Date(task.due_at).toLocaleString('fr-FR') : '—'}</td>
                <td><span className={`badge ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'orange' : 'gray'}`}>
                  {task.priority}</span></td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}

      {add && <AddTask onClose={() => { setAdd(false); load() }} />}
    </>
  )
}

function AddTask({ onClose }) {
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  useEffect(() => {
    supabase.from('students').select('id,full_name').eq('is_archived', false).then(({ data }) => setStudents(data ?? []))
  }, [])
  async function submit(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    const { error } = await supabase.from('tasks').insert({
      title: f.title,
      description: f.description || null,
      priority: f.priority,
      due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
      student_id: f.student_id || null,
      assignee: profile.role === 'agent' ? profile.id : (f.assignee || profile.id),
      created_by: profile.id,
      agency_id: profile.agency_id,
    })
    if (error) return alert(error.message)
    onClose()
  }
  return (
    <Modal title="Nouvelle tâche" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Titre *"><input name="title" required /></Field>
        <Field label="Description"><textarea name="description" rows={2} /></Field>
        <div className="grid c2">
          <Field label="Priorité">
            <select name="priority" defaultValue="normal">
              <option value="low">Basse</option><option value="normal">Normale</option>
              <option value="high">Haute</option><option value="urgent">Urgente</option>
            </select>
          </Field>
          <Field label="Échéance"><input type="datetime-local" name="due_at" /></Field>
        </div>
        <Field label="Étudiant lié (optionnel)">
          <select name="student_id" defaultValue="">
            <option value="">—</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary">Créer</button>
        </div>
      </form>
    </Modal>
  )
}
