import { ref, computed } from 'vue'
import { fetchFohVideos } from '@/lib/db.js'
import { supabase } from '@/lib/supabase.js'

// ─── YouTube helpers ───────────────────────────────────────────────────────────

function isYoutubeUrl(url) {
  return /youtube\.com|youtu\.be/.test(url ?? '')
}

function youtubeEmbedUrl(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  if (!match) return url
  const id = match[1]
  // autoplay + muted (required by browsers) + no controls + no related videos
  // loop=1 + playlist=id keeps YouTube itself looping as a fallback
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&loop=1&playlist=${id}`
}

function enrichVideo(v) {
  const youtube = isYoutubeUrl(v.url)
  return {
    ...v,
    type:     youtube ? 'youtube' : 'direct',
    embedUrl: youtube ? youtubeEmbedUrl(v.url) : v.url,
  }
}

// ─── Composable ────────────────────────────────────────────────────────────────

export function useFohVideos() {
  const videos    = ref([])
  const index     = ref(0)
  let   _unsub    = null

  const current   = computed(() => videos.value[index.value] ?? null)
  const hasVideos = computed(() => videos.value.length > 0)

  async function load() {
    try {
      const raw    = await fetchFohVideos()
      videos.value = raw.map(enrichVideo)
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
