import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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
    const { data: locked } = await supabase.rpc('login_is_locked', { p_email: clean })
    if (locked) throw new Error('accountLocked')

    const { error } = await supabase.auth.signInWithPassword({ email: clean, password })
    if (error) {
      if (error.message?.toLowerCase().includes('invalid login')) {
        await supabase.rpc('login_register_failure', { p_email: clean })
        const { data: nowLocked } = await supabase.rpc('login_is_locked', { p_email: clean })
        throw new Error(nowLocked ? 'accountLocked' : 'badCredentials')
      }
      throw new Error(error.message)
    }
    await supabase.rpc('login_reset', { p_email: clean })
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
