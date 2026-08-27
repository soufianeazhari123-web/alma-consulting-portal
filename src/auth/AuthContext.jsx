import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Q14 owner decision: hard 30-minute inactivity logout for everyone.
  useEffect(() => {
    let timer
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { supabase.auth.signOut(); window.location.href = '/login' }, 30 * 60 * 1000)
    }
    const evts = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(timer); evts.forEach((e) => window.removeEventListener(e, reset)) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*, agency:agencies(name, invoice_prefix)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  // Lockout-aware sign-in (5 failures -> 30 min, enforced in DB)
  async function signIn(email, password) {
    const clean = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password })
    if (error) throw new Error(error.message)
    // inactive/pending accounts get bounced immediately
    const { data: prof } = await supabase.from('profiles').select('is_active').eq('id', (await supabase.auth.getUser()).data.user.id).single()
    if (prof && !prof.is_active) {
      await supabase.auth.signOut()
      throw new Error('accountInactive')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
