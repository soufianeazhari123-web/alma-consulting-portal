import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../lib/i18n'

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
        { to: '/team', label: isSA ? t('teamAgencies') : t('addStaff').replace('Ajouter un membre','Équipe'), show: isSA || isDir },
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
            const order = ['fr', 'en', 'ar']
            setLang(order[(order.indexOf(lang) + 1) % order.length])
          }}>
            {lang === 'fr' ? 'EN' : lang === 'en' ? 'AR' : 'FR'}
          </button>
        </div>
      </aside>

      <main className="main" onClick={() => open && setOpen(false)}>
        <div className="topbar no-print">
          <button className="btn ghost sm menu-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>☰</button>
          <div />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
