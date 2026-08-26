import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Loading, StageBadge } from '../components/ui'

export default function Dashboard() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState([])
  const [kpis, setKpis] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    // RLS automatically scopes every query to the caller's agency/assignment
    let q = supabase.from('cases').select('id, ref, stage, application_deadline, student:students(full_name), country:countries(name_fr)')
      .eq('archived', false)
      .order('application_deadline', { ascending: true })
      .limit(8)
    if (profile.role === 'agent') q = q.eq('agent_id', profile.id)

    const [casesRes, studentsRes, tasksRes, payRes, queueRes] = await Promise.all([
      q,
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_archived', false),
      supabase.from('tasks').select('id', { count: 'exact', head: true })
        .neq('status', 'done').lt('due_at', new Date().toISOString()),
      supabase.from('payments').select('amount', { count: 'exact' }).eq('status', 'pending_verification'),
      profile.role === 'super_admin'
        ? supabase.from('cases').select('*, student:students(full_name), agent:profiles(full_name), agency:agencies(name)')
            .eq('stage', 'ready_for_review')
        : Promise.resolve({ data: [] }),
    ])
    setStats({
      cases: casesRes.data?.length ?? 0,
      students: studentsRes.count ?? 0,
      overdueTasks: tasksRes.count ?? 0,
      pendingPayments: payRes.data?.length ?? 0,
      pendingAmount: (payRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
      soonest: casesRes.data ?? [],
    })
    setQueue(queueRes.data ?? [])

    // Q17: per-agent KPI cards (director / owner view)
    if (profile.role === 'super_admin' || profile.role === 'director') {
      const { data: rows } = await supabase.from('cases')
        .select('stage, agent:profiles!cases_agent_id_fkey(id, full_name)').neq('archived', true)
      const map = {}
      for (const r of rows ?? []) {
        const a = r.agent; if (!a) continue
        map[a.id] ??= { name: a.full_name, active: 0, ready: 0, returned: 0 }
        map[a.id].active++
        if (r.stage === 'ready_for_review') map[a.id].ready++
        if (r.stage === 'changes_requested') map[a.id].returned++
      }
      setKpis(Object.values(map).sort((x, y) => y.active - x.active))
    }
  }

  if (!stats) return <Loading />

  return (
    <>
      <div className="topbar"><h1 className="page">{t('dashboard')}</h1></div>

      <div className="grid c3">
        <div className="card stat"><div className="k">{t('students')}</div><div className="v">{stats.students}</div></div>
        <div className="card stat"><div className="k">{t('applications')}</div><div className="v">{stats.cases}</div></div>
        <div className="card stat gold"><div className="k">{t('reviewQueue')}</div><div className="v">{queue.length}</div></div>
        <div className="card stat"><div className="k">Overdue {t('tasks').toLowerCase()}</div><div className="v">{stats.overdueTasks}</div></div>
        <div className="card stat gold">
          <div className="k">{t('pending_verification')} ({t('payments')})</div>
          <div className="v">{stats.pendingPayments} · {stats.pendingAmount.toLocaleString()} MAD</div>
        </div>
      </div>

      {profile.role === 'super_admin' && queue.length > 0 && (
        <>
          <h2 className="section">{t('reviewQueue')} — {queue.length}</h2>
          <div className="tablewrap"><table className="tbl">
            <thead><tr><th>{t('caseRef')}</th><th>Étudiant</th><th>{t('agency')}</th><th>Agent</th><th>Pays</th></tr></thead>
            <tbody>
              {queue.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
                  <td><strong>{c.ref}</strong></td>
                  <td>{c.student?.full_name}</td>
                  <td>{c.agency?.name}</td>
                  <td>{c.agent?.full_name}</td>
                  <td>{c.country?.name_fr}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}

      {kpis && kpis.length > 0 && (
        <>
          <h2 className="section">Performance par agent</h2>
          <div className="grid c3">
            {kpis.map((k) => (
              <div className="card stat" key={k.name}>
                <div className="k">{k.name}</div>
                <div className="v" style={{ fontSize: 17 }}>{k.active} dossiers actifs</div>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <span className="badge gold">{k.ready} à réviser</span>
                  <span className="badge orange">{k.returned} retournés</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section">Prochaines échéances</h2>
      {stats.soonest.length === 0 ? <p className="hint">{t('noData')}</p> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th>{t('caseRef')}</th><th>Étudiant</th><th>{t('country')}</th><th>{t('deadline')}</th><th>{t('stage')}</th></tr></thead>
          <tbody>
            {stats.soonest.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
                <td><strong>{c.ref}</strong></td>
                <td>{c.student?.full_name}</td>
                <td>{c.country?.name_fr}</td>
                <td>{c.application_deadline ?? '—'}</td>
                <td><StageBadge s={c.stage} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )
}
