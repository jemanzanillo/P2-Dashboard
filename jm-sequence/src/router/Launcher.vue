<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function openScreen(path) {
  router.push(path)
}
</script>

<template>
  <button class="launcher-btn launcher-btn--primary" @click="openScreen('/foh')">
    Abrir pantalla FOH
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        stroke-linejoin="round" />
    </svg>
  </button>
  <button class="launcher-btn launcher-btn--secondary" @click="openScreen('/agent')">
    Abrir panel de despacho
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
        stroke-linejoin="round" />
    </svg>
  </button>
  <footer class="launcher-footer">
    <p>JM Sequence · MVP Demo</p>
    <p>JM Multidesign · WCAG 2.1 AA · Vue 3 + Pinia</p>
  </footer>
</template>

<style scoped></style>