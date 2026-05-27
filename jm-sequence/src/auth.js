import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

console.log('[auth.js] supabase client imported:', {
  hasAuth: !!supabase.auth,
  hasFrom: typeof supabase.from,
  hasRealtime: !!supabase.realtime,
})

export const useAuthStore = defineStore('auth', () => {
  const user    = ref(null)
  const profile = ref(null)

  let _initialized  = false
  let _unsubscribe  = null
  let _sessionCheckInterval = null

  async function init() {
    if (_initialized) return
    _initialized = true

    // ── Phase 1: instant optimistic restore from localStorage ─────────────────
    // Read the raw session synchronously so the router guard passes on refresh
    // without waiting for a network round-trip to Supabase.
    const storedSession = _readStoredSession()
    if (storedSession?.user) {
      user.value = storedSession.user
      console.log('[auth] Optimistic restore from localStorage:', user.value?.email)
    }

    // ── Phase 2: real validation via SDK (async, may trigger token refresh) ───
    // Register the listener before anything else so no event is missed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[auth] onAuthStateChange:', event, { hasSession: !!session })
      user.value = session?.user ?? null
      if (user.value) {
        try { await fetchProfile() } catch (e) { console.error('[auth] fetchProfile:', e) }
      } else {
        profile.value = null
      }
    })
    _unsubscribe = () => subscription.unsubscribe()

    // Wait for INITIAL_SESSION with a generous timeout.
    // If it times out, the optimistic value from Phase 1 remains —
    // the user stays on-screen and the SDK keeps validating in the background.
    await Promise.race([
      new Promise((resolve) => {
        const { data: { subscription: s2 } } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'INITIAL_SESSION') { s2.unsubscribe(); resolve() }
        })
      }),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ])

    // Start background token refresh to keep agents logged in all day
    _startSessionCheck()
  }

  // Read stored Supabase session directly from localStorage — no network, instant
  function _readStoredSession() {
    try {
      // Supabase v2 stores the session under this key pattern
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key)
          if (raw) return JSON.parse(raw)
        }
      }
    } catch (e) {
      console.warn('[auth] Could not parse stored session:', e.message)
    }
    return null
  }

  function cleanup() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
    if (_sessionCheckInterval) { clearInterval(_sessionCheckInterval); _sessionCheckInterval = null }
    _initialized = false
  }

  // Background session validation — runs every 5 minutes to catch token expiration early
  function _startSessionCheck() {
    if (_sessionCheckInterval) return // Already running

    _sessionCheckInterval = setInterval(async () => {
      try {
        // Quietly refresh the token to keep session alive
        const { data, error } = await supabase.auth.refreshSession()
        if (error) {
          console.warn('[auth] Session refresh failed:', error.message)
          // Don't clear session yet — only if refresh explicitly fails
          // This prevents log-out on transient network issues
        } else if (data?.session) {
          console.log('[auth] Session refreshed successfully')
        }
      } catch (e) {
        console.error('[auth] Session check exception:', e.message)
      }
    }, 5 * 60 * 1000) // Check every 5 minutes
  }

  async function fetchProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, ventanillas(*)')
      .eq('id', user.value.id)
      .single()
    if (!error) profile.value = data
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
    await fetchProfile()
  }

  async function logout() {
    await supabase.auth.signOut({ scope: 'local' })
  }

  return { user, profile, init, cleanup, login, logout }
})