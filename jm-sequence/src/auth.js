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

    // Await INITIAL_SESSION so the router guard sees the correct auth state
    // before the first route renders. We only resolve on INITIAL_SESSION —
    // later events (SIGNED_IN, SIGNED_OUT) are handled by the same listener
    // but don't block mount. fetchProfile is wrapped so a DB/RLS error never
    // leaves the Promise permanently pending (blank page).
    await Promise.race([
      new Promise((resolve) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          user.value = session?.user ?? null
          if (user.value) {
            try { await fetchProfile() } catch (e) { console.error('[auth] fetchProfile:', e) }
          } else {
            profile.value = null
          }
          if (event === 'INITIAL_SESSION') {
            // Validate the session is actually usable
            console.log('[auth] INITIAL_SESSION:', { hasUser: !!user.value, hasSession: !!session })
            if (user.value && session?.access_token) {
              // Session restored successfully
              console.log('[auth] Session restored from storage')
            } else if (user.value && !session?.access_token) {
              // User exists but no valid token — session is corrupted
              console.warn('[auth] Session restored but no valid token — clearing')
              user.value = null
              profile.value = null
            }
            resolve()
          }
        })
        _unsubscribe = () => subscription.unsubscribe()
      }),
      new Promise((resolve) => setTimeout(() => resolve(), 3000)) // 3s timeout
    ])

    // Start background session check to keep token fresh
    _startSessionCheck()
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