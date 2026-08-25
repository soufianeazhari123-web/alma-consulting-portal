import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Loading, Empty } from '../components/ui'

// Super Admin only: one queue of every case agents marked ready (spec §7)
export default function ReviewQueue() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('cases')
      .select('*, student:students(full_name), agent:profiles!cases_agent_id_fkey(full_name), agency:agencies(name), country:countries(name_fr)')
      .eq('stage', 'ready_for_review')
      .order('marked_ready_at', { ascending: true }) // longest waiting first
    setRows(data ?? [])
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar"><h1>File de révision ({rows.length})</h1></div>
      {rows.length === 0 ? <Empty msg="Aucun dossier en attente de révision." /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>Dossier</th><th>Étudiant</th><th>Agence</th><th>Agent</th><th>Pays</th>
            <th>En attente depuis</th>
          </tr></thead>
          <tbody>{rows.map((c) => {
            const waitH = Math.floor((Date.now() - new Date(c.marked_ready_at)) / 3600000)
            return (
              <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
                <td><strong>{c.ref}</strong></td>
                <td>{c.student?.full_name}</td>
                <td>{c.agency?.name}</td>
                <td>{c.agent?.full_name}</td>
                <td>{c.country?.name_fr}</td>
                <td>{waitH >= 48
                  ? <span className="badge red">{Math.floor(waitH / 24)} j</span>
                  : <span className="badge orange">{waitH} h</span>}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
    </>
  )
}
