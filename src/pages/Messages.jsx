import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Loading, Empty } from '../components/ui'

// Student-visible message thread (staff side). Internal notes live
// in a separate table and are NEVER shown here (spec §12).
export default function Messages() {
  const { profile } = useAuth()
  const [students, setStudents] = useState(null)
  const [sel, setSel] = useState(null)
  const [thread, setThread] = useState([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    supabase.from('students').select('id,full_name').eq('is_archived', false)
      .order('full_name').then(({ data }) => setStudents(data ?? []))
  }, [])

  useEffect(() => {
    if (!sel) return
    load()
    const ch = supabase.channel(`msg-${sel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `student_id=eq.${sel}` },
        () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sel])

  async function load() {
    const { data } = await supabase.from('messages')
      .select('*, sender:profiles(full_name)').eq('student_id', sel).order('created_at')
    setThread(data ?? [])
  }

  async function send(e) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      await supabase.rpc('send_message', { p_student: sel, p_body: draft.trim(), p_case: null })
      setDraft('')
    } catch (ex) { alert(ex.message) }
  }

  if (!students) return <Loading />
  return (
    <>
      <div className="topbar"><h1>Messages (visibles par l’étudiant)</h1></div>
      <div className="grid" style={{ gridTemplateColumns: '240px 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 8 }}>
          {students.map((s) => (
            <div key={s.id} onClick={() => setSel(s.id)}
              style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                background: sel === s.id ? '#f5edd6' : 'transparent' }}>
              {s.full_name}
            </div>
          ))}
        </div>
        <div className="card">
          {!sel ? <Empty msg="Sélectionnez un étudiant." /> : (
            <>
              <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 12 }}>
                {thread.length === 0 && <Empty msg="Aucun message." />}
                {thread.map((m) => (
                  <div key={m.id} style={{
                    background: m.sender_id === profile.id ? '#f5f1e4' : '#f2f4f7',
                    borderRadius: 10, padding: '8px 12px', marginBottom: 8, maxWidth: '80%',
                  }}>
                    <small className="hint">{m.sender?.full_name} · {new Date(m.created_at).toLocaleString('fr-FR')}</small>
                    <div>{m.body}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="row">
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message à l’étudiant…" />
                <button className="btn primary">Envoyer</button>
              </form>
              <p className="hint">⚠ Les notes internes ne passent jamais par ce fil.</p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
