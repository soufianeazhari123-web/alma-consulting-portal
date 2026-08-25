import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
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

const STAFF_ROLES = ['super_admin', 'director', 'agent']

function Guard({ roles, children }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="main"><p>…</p></div>
  if (!profile || !profile.is_active) return <Navigate to="/login" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

function Home() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'student' ? '/portal' : '/dashboard'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<Home />} />

          {/* Staff area */}
          <Route element={<Guard roles={['super_admin','director','agent']}><Layout /></Guard>}>
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
            <Route path="/audit" element={<Guard roles={['super_admin']}><Audit /></Guard>} />
            <Route path="/templates" element={<Guard roles={['super_admin']}><Templates /></Guard>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/team" element={<Team />} />
          </Route>

          {/* Student portal */}
          <Route element={<Guard roles={['student']}><Layout portal /></Guard>}>
            <Route path="/portal" element={<PortalHome />} />
            <Route path="/portal/case/:id" element={<PortalCase />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import AgenciesPage from './pages/Agencies'
function Team() {
  const { profile } = useAuth()
  return profile.role === 'super_admin' ? <AgenciesPage /> : <Staff />
}
