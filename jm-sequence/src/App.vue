<script setup>
import { watch, onUnmounted } from 'vue'
import { useQueueStore } from '@/queue.js'
import { useAuthStore } from '@/auth.js'
import { useRouter } from 'vue-router'
import { Analytics } from '@vercel/analytics/vue'

const store  = useQueueStore()
const auth   = useAuthStore()
const router = useRouter()

watch(
  () => auth.user,
  (user, prevUser) => {
    if (user) {
      store.init()
    } else {
      store.cleanup()
      // Mid-session expiry: prevUser check prevents redirecting on initial
      // page load (when the user is not yet authenticated). The router guard
      // handles the initial unauthenticated redirect; this handles the case
      // where a session dies while the agent tab is already open.
      if (prevUser && router.currentRoute.value.meta.requiresAuth) {
        router.push('/login')
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => store.cleanup())
</script>

<template>
  <Analytics />
  <router-view />
</template>

<style scoped></style>
