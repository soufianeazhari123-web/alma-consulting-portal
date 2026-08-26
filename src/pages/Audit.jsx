import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { Loading, Empty } from '../components/ui'

// Append-only audit trail — Super Admin read-only (spec §16).
export default function Audit() {
  const { t, lang } = useLang()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { load() }, [q])
  async function load() {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
    if (q) query = query.or(`entity.ilike.%${q}%,action.ilike.%${q}%,actor_staff_code.ilike.%${q}%`)
    const { data } = await query
    setRows(data ?? [])
  }
  if (!rows) return <Loading />
  return (
    <>
      <div className="topbar">
        <h1>{t('auditTitle')}</h1>
        <input placeholder={t('filterPhAudit')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      </div>
      {rows.length === 0 ? <Empty msg={t('noData')} /> : (
        <div className="tablewrap"><table className="tbl">
          <thead><tr>
            <th>{t('dateCol')}</th><th>{t('actorCol')}</th><th>{t('actionCol')}</th><th>{t('entityCol')}</th><th>Détail</th>
          </tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString(lang==='ar'?'ar-MA':lang==='en'?'en-GB':'fr-FR')}</td>
              <td>{a.actor_staff_code ?? a.actor_role ?? t('system')}</td>
              <td><span className="badge gray">{a.action}</span></td>
              <td>{a.entity}{a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}…` : ''}</td>
              <td className="hint" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.new_values ? JSON.stringify(a.new_values).slice(0, 120) : ''}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}
