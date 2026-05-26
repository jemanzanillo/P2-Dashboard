<script setup>
import { watch, onUnmounted } from 'vue'
import { useQueueStore } from '@/queue.js'
import { useAuthStore } from '@/auth.js'
import { Analytics } from '@vercel/analytics/vue'

const store = useQueueStore()
const auth  = useAuthStore()

watch(
  () => auth.user,
  (user) => {
    if (user) store.init()
    else      store.cleanup()
  },
  { immediate: true }
)

onUnmounted(() => store.cleanup())
</script>

<template>
  <Analytics />
  <router-view />
  <Analytics />
</template>

<style scoped></style>
