<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQueueStore } from '@/queue.js'

const router = useRouter()
const store  = useQueueStore()

function openScreen(path) {
  router.push(path)
}

onMounted(() => store.init())
onUnmounted(() => store.cleanup())
</script>

<template>
  <router-view />
</template>

<style scoped></style>
