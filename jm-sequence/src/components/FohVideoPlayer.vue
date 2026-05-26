<template>
  <div class="video-player">
    <video
      v-if="current"
      ref="videoEl"
      class="video-el"
      autoplay
      muted
      playsinline
      :src="current.url"
      @ended="advance"
      @error="advance"
    />
    <div v-else class="video-empty" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useFohVideos } from '@/composables/useFohVideos.js'

const { current, load, advance, subscribeToPlaylistChanges, cleanup } = useFohVideos()

const videoEl = ref(null)

// When the video source changes (next in playlist), force a reload
watch(current, () => {
  if (videoEl.value) {
    videoEl.value.load()
    videoEl.value.play().catch(() => {})
  }
})

onMounted(async () => {
  await load()
  subscribeToPlaylistChanges()
})

onUnmounted(cleanup)
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
}

.video-empty {
  width: 100%;
  height: 100%;
  background-color: #07101E;
}
</style>
