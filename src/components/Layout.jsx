import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'

// Q24: in-app notification bell, role-aware (counts via RLS-scoped queries)
function Bell() {
  const { profile } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [count, setCount] = useState(0)
  const [target, setTarget] = useState('/dashboard')
  const [label, setLabel] = useState('')

  useEffect(() => {
    let live = true
    async function poll() {
      try {
        if (profile.role === 'super_admin') {
          const { count } = await supabase.from('cases')
            .select('id', { count: 'exact', head: true }).eq('stage', 'ready_for_review')
          if (live) { setCount(count ?? 0); setTarget('/review-queue'); setLabel(t('notifReadyReview')) }
        } else if (profile.role === 'director') {
          const [{ count: pc }, { count: rc }] = await Promise.all([
            supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending_verification'),
            supabase.from('cases').select('id', { count: 'exact', head: true }).eq('stage', 'ready_for_review'),
          ])
          if (live) {
            const total = (pc ?? 0) + (rc ?? 0)
            setCount(total)
            setTarget(total && (pc ?? 0) >= (rc ?? 0) ? '/payments' : '/cases')
            setLabel(`${pc ?? 0} ${t('notifPendingPay')} · ${rc ?? 0} ${t('notifReadyReview')}`)
          }
        } else if (profile.role === 'agent') {
          const { count } = await supabase.from('cases')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', profile.id).eq('stage', 'changes_requested')
          if (live) { setCount(count ?? 0); setTarget('/cases'); setLabel(t('notifReturned')) }
        }
      } catch { /* silent */ }
    }
    poll()
    const iv = setInterval(poll, 60_000)
    return () => { live = false; clearInterval(iv) }
  }, [profile.role, profile.id])

  if (!count) return null
  return (
    <button className="btn ghost sm" title={label}
      onClick={() => nav(target)}
      style={{ position: 'relative' }}>
      🔔
      <span style={{
        position: 'absolute', top: -6, insetInlineEnd: -6,
        background: '#b3261e', color: '#fff', borderRadius: 999,
        fontSize: 10.5, fontWeight: 700, padding: '1px 5px',
      }}>{count}</span>
    </button>
  )
}

export default function Layout({ portal = false }) {
  const { profile, signOut } = useAuth()
  const { t, lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  const isSA = profile.role === 'super_admin'
  const isDir = profile.role === 'director'

  // RTL support for Arabic (spec §17)
  React.useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const links = portal
    ? [
        { to: '/portal', label: t('dashboard') },
      ]
    : [
        { to: '/dashboard', label: t('dashboard'), show: true },
        { to: '/students', label: t('students'), show: true },
        { to: '/cases', label: t('applications'), show: true },
        { to: '/review-queue', label: t('reviewQueue'), show: isSA },
        { to: '/tasks', label: t('tasks'), show: true },
        { to: '/calendar', label: t('calendar'), show: true },
        { to: '/payments', label: t('payments'), show: true },
        { to: '/reports', label: t('reports'), show: isSA || isDir },
        { to: '/messages', label: t('messages'), show: true },
        { section: t('teamAgencies'), show: isSA || isDir },
        { to: '/agencies', label: lang === 'fr' ? 'Agences' : lang === 'ar' ? 'الوكالات' : 'Agencies', show: isSA },
        { to: '/team', label: t('team'), show: isSA || isDir },
        { to: '/templates', label: t('templates'), show: isSA },
        { to: '/audit', label: t('audit'), show: isSA },
        { to: '/settings', label: t('settings'), show: isSA },
      ]

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="mark">{t('appName')}</div>
          <div className="sub">{portal ? t('portalTag') : t('internalTag')}</div>
        </div>
        <nav className="nav">
          {links.filter(l => l.show !== false).map((l, i) =>
            l.section
              ? <div key={i} className="section">{l.section}</div>
              : <NavLink key={i} to={l.to} className={({ isActive }) => isActive ? 'active' : ''}>{l.label}</NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="who">{profile.full_name || profile.email}</div>
          <div>
            <span className="role">{t(profile.role)}</span>
            {profile.staff_code && <> · {profile.staff_code}</>}
            {profile.agency?.name && <> · {profile.agency.name}</>}
          </div>
          <button className="linklike" onClick={async () => { await signOut(); nav('/login') }}>
            {t('signOut')}
          </button>{' '}
          <button className="linklike" onClick={() => {
            const order = ['fr', 'en']
            setLang(order[(order.indexOf(lang) + 1) % order.length])
          }}>
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>
      </aside>

      <main className="main" onClick={() => open && setOpen(false)}>
        <div className="topbar no-print">
          <button className="btn ghost sm menu-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>☰</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost sm" title="Changer de langue / Change language"
              onClick={() => { const order = ['fr','en']; setLang(order[(order.indexOf(lang)+1)%order.length]) }}>
              🌐 {lang.toUpperCase()}
            </button>
            {!portal && <Bell />}
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
