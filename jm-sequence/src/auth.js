import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user    = ref(null)
  const profile = ref(null)

  let _initialized  = false
  let _unsubscribe  = null

  async function init() {
    if (_initialized) return
    _initialized = true

    const { data: { session } } = await supabase.auth.getSession()
    user.value = session?.user ?? null
    if (user.value) await fetchProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      user.value = session?.user ?? null
      if (user.value) await fetchProfile()
      else profile.value = null
    })
    _unsubscribe = () => subscription.unsubscribe()
  }

  function cleanup() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
    _initialized = false
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