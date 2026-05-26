import { ref, computed } from 'vue'
import { fetchFohVideos } from '@/lib/db.js'
import { supabase } from '@/lib/supabase.js'

export function useFohVideos() {
  const videos  = ref([])
  const index   = ref(0)
  let _unsub = null

  const current = computed(() => videos.value[index.value] ?? null)
  const hasVideos = computed(() => videos.value.length > 0)

  async function load() {
    try {
      videos.value = await fetchFohVideos()
      index.value  = 0
    } catch (e) {
      console.warn('[useFohVideos] could not load videos (DB columns may not exist yet):', e?.message ?? e)
    }
  }

  function advance() {
    if (!hasVideos.value) return
    index.value = (index.value + 1) % videos.value.length
  }

  function subscribeToPlaylistChanges() {
    _unsub = supabase
      .channel('foh-videos')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contenido_foh' },
        () => load()
      )
      .subscribe()
  }

  function cleanup() {
    if (_unsub) { supabase.removeChannel(_unsub); _unsub = null }
  }

  return { videos, current, hasVideos, load, advance, subscribeToPlaylistChanges, cleanup }
}
