<template>
  <div class="video-player">

    <template v-if="current">

      <!-- ── YouTube embed ─────────────────────────────────────────── -->
      <iframe
        v-if="current.type === 'youtube'"
        class="video-el"
        :src="current.embedUrl"
        :key="current.id"
        frameborder="0"
        allow="autoplay; encrypted-media"
        allowfullscreen
      />

      <!-- ── Direct video file ─────────────────────────────────────── -->
      <video
        v-else
        ref="videoEl"
        class="video-el"
        autoplay
        muted
        playsinline
        :src="current.url"
        :key="current.id"
        @ended="advance"
        @error="advance"
      />

    </template>

    <!-- ── No videos in playlist ─────────────────────────────────── -->
    <div v-else class="video-empty" />

  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useFohVideos } from '@/composables/useFohVideos.js'

const YOUTUBE_FALLBACK_SECONDS = 60 // advance after this many seconds if duracion_segundos is unset

const { current, load, advance, subscribeToPlaylistChanges, cleanup } = useFohVideos()

const videoEl  = ref(null)
let   _ytTimer = null

// ── YouTube timer ─────────────────────────────────────────────────────────────
// iframes can't emit @ended, so we advance after duracion_segundos (or fallback)

function clearYtTimer() {
  if (_ytTimer) { clearTimeout(_ytTimer); _ytTimer = null }
}

function startYtTimer(video) {
  clearYtTimer()
  const seconds = video.duracion_segundos ?? YOUTUBE_FALLBACK_SECONDS
  _ytTimer = setTimeout(advance, seconds * 1000)
}

// ── Watch current video ───────────────────────────────────────────────────────

watch(current, (video) => {
  clearYtTimer()

  if (!video) return

  if (video.type === 'youtube') {
    startYtTimer(video)
  } else {
    // Native <video> reloads automatically via :key binding; just ensure play
    if (videoEl.value) {
      videoEl.value.load()
      videoEl.value.play().catch(() => {})
    }
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await load()
  subscribeToPlaylistChanges()
  // Start timer immediately if first video is YouTube
  if (current.value?.type === 'youtube') startYtTimer(current.value)
})

onUnmounted(() => {
  clearYtTimer()
  cleanup()
})
</script>

<style scoped>
.video-player {
  width: 100%;
  height: 100%;
}

.video-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border: none;
}

.video-empty {
  width: 100%;
  height: 100%;
  background-color: #07101E;
}
</style>
