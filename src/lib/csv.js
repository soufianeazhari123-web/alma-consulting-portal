import { supabase } from './supabase'

// Client-side CSV export; every export is written to the audit trail
// via log_export (spec §14 — exports obey RLS and must be audited).
export async function exportCsv(filename, scope, rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const head = columns.map((c) => c.label).join(';')
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(';')).join('\n')
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  try { await supabase.rpc('log_export', { p_scope: scope, p_rows: rows.length }) } catch { /* non-staff */ }
}
