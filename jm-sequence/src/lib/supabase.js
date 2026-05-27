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
})

console.log('[supabase.js] Client created successfully:', {
  url: supabaseUrl,
  auth: !!supabase.auth,
  from: typeof supabase.from,
  realtime: !!supabase.realtime,
})