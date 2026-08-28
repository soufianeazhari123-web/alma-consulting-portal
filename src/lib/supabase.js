import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'PLACEHOLDER-ANON-KEY',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)

// Call the privileged Netlify function with the caller's JWT
export async function callAdminFn(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body.detail ? `${body.error}: ${body.detail}` : (body.error || `http_${res.status}`)
    const err = new Error(msg)
    err.detail = body.detail
    throw err
  }
  return body
}
