import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'
import { Loading, Empty, StageBadge } from '../components/ui'

export default function Cases() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [stage, setStage] = useState('')

  useEffect(() => { load() }, [stage])
  async function load() {
    let q = supabase.from('cases')
      .select('*, student:students(full_name), country:countries(name_fr), service:service_types(label_fr)')
      .neq('archived', true)
      .order('updated_at', { ascending: false })
    if (profile.role === 'agent') q = q.eq('agent_id', profile.id)
    if (stage) q = q.eq('stage', stage)
    const { data } = await q
    setRows(data ?? [])
  }

  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar">
        <h1 className="page">{t('applications')}</h1>
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: 220 }}>
          <option value="">{t('allStages')}</option>
          {['draft','documents_in_progress','ready_for_review','changes_requested','approved_for_submission',
            'appointment_booked','submitted','additional_info_requested','accepted','rejected',
            'visa_approved','visa_refused','withdrawn','closed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('ref')}</th><th>{t('students')}</th><th>{t('country')}</th><th>{t('service')}</th><th>{t('stage')}</th>
          </tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
              <td><strong>{c.ref}</strong>{c.is_free_retake && <> <span className="badge gold">{t('freeRetake')}</span></>}</td>
              <td>{c.student?.full_name}</td>
              <td>{c.country?.name_fr}</td>
              <td>{c.service?.label_fr}</td>
              <td><StageBadge s={c.stage} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
