import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Modal, Field, Loading, Empty, StatusBadge } from '../components/ui'

export default function Tasks() {
  const { profile } = useAuth()
  const { t, lang } = useLang()
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
            <option value="mine">{t('myTasksView')}</option>
            <option value="all">{profile.role === 'super_admin' ? t('allCompany') : t('agencyView')}</option>
            <option value="overdue">{t('overdueOnly')}</option>
          </select>
          <button className="btn primary" onClick={() => setAdd(true)}>{t('newTask')}</button>
        </div>
      </div>

      {!rows ? <Loading /> : rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th></th><th>{t('tasks')}</th><th>{t('students')}</th><th>{t('assignedTo')}</th><th>{t('dueAt')}</th><th>{t('priority')}</th></tr></thead>
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
                  {' '}{task.due_at ? new Date(task.due_at).toLocaleString(lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-FR') : '—'}</td>
                <td><span className={`badge ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'orange' : 'gray'}`}>
                  {t({ low:'prioLow', normal:'prioNormal', high:'prioHigh', urgent:'prioUrgent' }[task.priority] ?? task.priority)}</span></td>
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
  const { t } = useLang()
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
    <Modal title={t('newTask')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('taskTitleLbl')}><input name="title" required /></Field>
        <Field label={t('description')}><textarea name="description" rows={2} /></Field>
        <div className="grid c2">
          <Field label={t('priority')}>
            <select name="priority" defaultValue="normal">
              <option value="low">{t('prioLow')}</option>
              <option value="normal">{t('prioNormal')}</option>
              <option value="high">{t('prioHigh')}</option>
              <option value="urgent">{t('prioUrgent')}</option>
            </select>
          </Field>
          <Field label={t('dueAt')}><input type="datetime-local" name="due_at" /></Field>
        </div>
        <Field label={t('linkedStudent')}>
          <select name="student_id" defaultValue="">
            <option value="">—</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary">{t('create')}</button>
        </div>
      </form>
    </Modal>
  )
}
