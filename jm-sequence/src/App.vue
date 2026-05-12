<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function openScreen(path) {
  router.push(path)
}
</script>

<template>
  <router-view />
</template>

<style scoped></style>
