import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agencies from './pages/Agencies'
import Staff from './pages/Staff'
import Students from './pages/Students'
import StudentDetail from './pages/StudentDetail'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import ReviewQueue from './pages/ReviewQueue'
import Tasks from './pages/Tasks'
import Payments from './pages/Payments'
import InvoiceView from './pages/InvoiceView'
import Templates from './pages/Templates'
import Audit from './pages/Audit'
import SettingsPage from './pages/SettingsPage'
import Messages from './pages/Messages'
import PortalHome from './pages/PortalHome'
import PortalCase from './pages/PortalCase'
import CalendarPage from './pages/Calendar'
import Security from './pages/Security'
import Reports from './pages/Reports'

// Q13: Super Admin + directors must hold an aal2 session (TOTP verified).
// If no TOTP factor is enrolled, access is allowed (so Google/OAuth login works
// without trapping the user in a redirect loop to /security).
function MfaGate({ children }) {
  const { profile } = useAuth()
  const needMfa = profile.role === 'super_admin' || profile.role === 'director'
  const [checked, setChecked] = useState(!needMfa)
  const [ok, setOk] = useState(!needMfa)
  const [hasFactor, setHasFactor] = useState(false)

  useEffect(() => {
    if (!needMfa) return
    let live = true
    supabase.auth.mfa.listFactors()
      .then((mf) => {
        if (!live) return
        const verified = (mf?.all ?? []).find((f) => f.status === 'verified')
        setHasFactor(!!verified)
        if (!verified) { setOk(true); setChecked(true); return }
        return supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      })
      .then((lvl) => {
        if (!live || !lvl) return
        setOk(lvl.data?.currentLevel === 'aal2')
        setChecked(true)
      })
      .catch(() => { if (live) { setOk(true); setChecked(true) } })
    return () => { live = false }
  }, [needMfa])

  if (!checked) return <div className="hint" style={{padding:40}}>Vérification sécurité…</div>
  if (needMfa && !ok && hasFactor) return <Navigate to="/security" replace />
  return children
}

function Guard({ roles, children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="main"><p>…</p></div>
  if (!profile || !profile.is_active) return <Navigate to="/login" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

function Home() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="main"><p>…</p></div>
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={profile.role === 'student' ? '/portal' : '/dashboard'} replace />
}

function Team() {
  const { profile } = useAuth()
  return profile.role === 'super_admin' ? <Staff /> : <Staff />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* MFA enrollment / verification — reachable while aal1 */}
          <Route element={<Guard><Security /></Guard>} path="/security" />

          {/* Staff area */}
          <Route element={
            <Guard roles={['super_admin', 'director', 'agent']}>
              <MfaGate><Layout /></MfaGate>
            </Guard>
          }>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/review-queue" element={<ReviewQueue />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/invoices/:id" element={<InvoiceView />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/audit" element={<Guard roles={['super_admin']}><Audit /></Guard>} />
            <Route path="/templates" element={<Guard roles={['super_admin']}><Templates /></Guard>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/team" element={<Guard roles={['super_admin','director']}><Staff /></Guard>} />
            <Route path="/agencies" element={<Guard roles={['super_admin']}><Agencies /></Guard>} />
          </Route>

          {/* Student portal */}
          <Route element={<Guard roles={['student']}><Layout portal /></Guard>}>
            <Route path="/portal" element={<PortalHome />} />
            <Route path="/portal/case/:id" element={<PortalCase />} />
          </Route>

          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
