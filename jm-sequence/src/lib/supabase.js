import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('[supabase.js] URL present:', !!supabaseUrl)
console.log('[supabase.js] Anon key present:', !!supabaseAnonKey)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[supabase.js] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is undefined. Check .env.local and restart the dev server.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

console.log('[supabase.js] Client created successfully:', {
  url: supabaseUrl,
  auth: !!supabase.auth,
  from: typeof supabase.from,
  realtime: !!supabase.realtime,
})

// Validate session is actually usable before making queries
export async function validateSession() {
  console.log('[supabase] validateSession: starting...')
  try {
    // Add timeout to prevent hanging
    const sessionPromise = supabase.auth.getSession()
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getSession timeout')), 3000)
    )

    const { data: { session }, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise
    ])

    console.log('[supabase] validateSession: got session:', { hasSession: !!session, hasError: !!sessionError })

    if (!session) {
      console.log('[supabase] validateSession: No active session')
      return { valid: false, reason: 'no_session' }
    }

    if (!session.access_token) {
      console.warn('[supabase] validateSession: Session missing access token — clearing corrupted session')
      // Session is corrupted, clear it
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch (e) {
        console.warn('[supabase] validateSession: signOut failed:', e.message)
      }
      return { valid: false, reason: 'no_access_token' }
    }

    console.log('[supabase] validateSession: Session valid, token present')
    return { valid: true }
  } catch (e) {
    console.error('[supabase] validateSession exception:', e.message)
    return { valid: false, reason: 'error', error: e.message }
  }
}