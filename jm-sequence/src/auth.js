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
  let _onVisibilityChange   = null
  let _pendingSignOut = false   // set true only when logout() is called from THIS tab

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
    // Handles SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[auth] onAuthStateChange:', event, { hasSession: !!session })

      // Cross-tab guard: when this tab already has an active session for User A,
      // ignore events triggered by User B logging in on a different tab in the same
      // browser. Supabase shares the auth token in localStorage across tabs, so a
      // second agent logging in on the same machine would otherwise wipe this
      // agent's session state and break the queue store mid-shift.
      if (user.value?.id && session?.user?.id && user.value.id !== session.user.id) {
        console.warn('[auth] Ignoring cross-tab auth event for different user:', session.user.email)
        return
      }

      if (event === 'SIGNED_OUT') {
        if (!_pendingSignOut) {
          // Before ignoring, verify a session still exists. A cross-tab
          // login-override emits SIGNED_OUT but leaves a new valid session in
          // localStorage; a genuine refresh-token expiry (7-day TTL or revoked)
          // leaves no session at all. This distinguishes the two cases.
          try {
            const { data } = await supabase.auth.getSession()
            if (data.session) {
              console.warn('[auth] Ignoring cross-tab SIGNED_OUT — session still valid for:', data.session.user?.email)
              return
            }
          } catch (e) {
            console.warn('[auth] getSession check during SIGNED_OUT failed:', e.message)
          }
          console.warn('[auth] Genuine session expiry detected — clearing user')
        }
        _pendingSignOut = false
        user.value    = null
        profile.value = null
        return
      }
      user.value = session?.user ?? null
      if (user.value) {
        try { await fetchProfile() } catch (e) { console.error('[auth] fetchProfile:', e) }
      } else {
        profile.value = null
      }
    })
    _unsubscribe = () => subscription.unsubscribe()

    // When the tab returns to the foreground, browsers may have throttled our
    // setInterval-based refresh — proactively re-check the session and refresh
    // if the access token is close to expiry. This is what keeps an idle FOH/TV
    // or backgrounded agent tab logged in across the day.
    _onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (!user.value) return   // anonymous (FOH/kiosk) — nothing to refresh
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const expiresAtMs = (session.expires_at ?? 0) * 1000
        const msUntilExpiry = expiresAtMs - Date.now()
        if (msUntilExpiry < 5 * 60 * 1000) {
          console.log('[auth] Token expiring soon — refreshing on visibility')
          await supabase.auth.refreshSession()
        }
      } catch (e) {
        console.warn('[auth] visibility refresh check failed:', e.message)
      }
    }
    document.addEventListener('visibilitychange', _onVisibilityChange)

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
    if (_onVisibilityChange) { document.removeEventListener('visibilitychange', _onVisibilityChange); _onVisibilityChange = null }
    _initialized = false
  }

  // Background session validation — runs every 5 minutes to catch token expiration early
  function _startSessionCheck() {
    if (_sessionCheckInterval) return // Already running

    _sessionCheckInterval = setInterval(async () => {
      if (!user.value) return   // anonymous (FOH/kiosk) — skip
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
    _pendingSignOut = true
    await supabase.auth.signOut({ scope: 'local' })
  }

  return { user, profile, init, cleanup, login, logout, fetchProfile }
})