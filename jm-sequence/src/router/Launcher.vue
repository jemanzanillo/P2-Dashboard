<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocaleStore } from '@/locale.js'
import { testConnection } from '@/lib/db.js'

const router = useRouter()
const locale = useLocaleStore()
const testResult = ref(null)
const testLoading = ref(false)

function openScreen(path) {
  router.push(path)
}

async function runConnectionTest() {
  testLoading.value = true
  testResult.value = null
  console.log('[Launcher] Running connection test...')
  try {
    const result = await testConnection()
    testResult.value = result
    console.log('[Launcher] Test result:', result)
  } catch (e) {
    testResult.value = { success: false, error: e.message }
    console.error('[Launcher] Test error:', e)
  } finally {
    testLoading.value = false
  }
}
</script>

<template>
  <div class="launcher">
    <div class="launcher-card">

      <header class="launcher-header">
        <span class="dev-badge">Dev Launcher</span>
        <h1 class="launcher-title">Hospital Docente Universitario<br>Dr. Darío Contreras</h1>
        <p class="launcher-sub">JM Sequence — Queue Management System</p>
      </header>

      <!-- Language toggle -->
      <div class="lang-toggle" role="group" aria-label="Language">
        <button
          class="lang-btn"
          :class="{ 'lang-btn--active': locale.lang === 'es' }"
          @click="locale.setLang('es')"
        >ES</button>
        <button
          class="lang-btn"
          :class="{ 'lang-btn--active': locale.lang === 'en' }"
          @click="locale.setLang('en')"
        >EN</button>
      </div>

      <nav class="launcher-nav">

        <button class="btn btn--primary" @click="openScreen('/foh')">
          <div class="btn-content">
            <span class="btn-label">FOH Screen</span>
            <span class="btn-sub">1920 × 1080 · Public display</span>
          </div>
          <svg class="btn-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12M12 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button class="btn btn--secondary" @click="openScreen('/agent')">
          <div class="btn-content">
            <span class="btn-label">Agent Panel</span>
            <span class="btn-sub">1440p · Agent desktop</span>
          </div>
          <svg class="btn-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12M12 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button class="btn btn--kiosk" @click="openScreen('/kiosk')">
          <div class="btn-content">
            <span class="btn-label">{{ locale.lang === 'es' ? 'Quiosco (Paciente)' : 'Kiosk (Patient)' }}</span>
            <span class="btn-sub">1024 × 768 · iPad 9th gen</span>
          </div>
          <svg class="btn-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12M12 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button class="btn btn--admin" @click="openScreen('/admin')">
          <div class="btn-content">
            <span class="btn-label">Admin Panel</span>
            <span class="btn-sub">1440p · System administration</span>
          </div>
          <svg class="btn-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10h12M12 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

      </nav>

      <footer class="launcher-footer">
        <span>JM Sequence · MVP Demo</span>
        <span class="footer-sep">·</span>
        <span>Vue 3 + Pinia · WCAG 2.1 AA</span>
      </footer>

      <!-- Debug section -->
      <div class="debug-section">
        <button class="debug-btn" @click="runConnectionTest" :disabled="testLoading">
          {{ testLoading ? 'Testing...' : 'Test Supabase Connection' }}
        </button>
        <div v-if="testResult" class="debug-result" :class="{ 'debug-result--success': testResult.success }">
          <div class="debug-result-status">{{ testResult.success ? '✓ Success' : '✗ Failed' }}</div>
          <pre class="debug-result-details">{{ JSON.stringify(testResult, null, 2) }}</pre>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Figtree:wght@300;400;500;600&display=swap');

/* ── Layout ─────────────────────────────────────────────────────────────── */
.launcher {
  min-height: 100vh;
  background-color: #07101E;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Figtree', sans-serif;
  padding: 32px 16px;
  box-sizing: border-box;
}

.launcher-card {
  width: 100%;
  max-width: 480px;
  background-color: #0C1828;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 48px 40px 32px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.launcher-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dev-badge {
  display: inline-block;
  font-family: 'Figtree', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #F0A429;
  background-color: rgba(240, 164, 41, 0.12);
  border: 1px solid rgba(240, 164, 41, 0.25);
  border-radius: 9999px;
  padding: 3px 10px;
  width: fit-content;
}

.launcher-title {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.25;
  color: #EEF3FF;
}

.launcher-sub {
  margin: 0;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: rgba(238, 243, 255, 0.50);
}

/* ── Language toggle ─────────────────────────────────────────────────────── */
.lang-toggle {
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  padding: 3px;
  width: fit-content;
  gap: 2px;
}

.lang-btn {
  font-family: 'Figtree', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: rgba(238, 243, 255, 0.45);
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.lang-btn:hover:not(.lang-btn--active) {
  color: rgba(238, 243, 255, 0.75);
  background-color: rgba(255, 255, 255, 0.06);
}

.lang-btn--active {
  color: #EEF3FF;
  background-color: #1A72FF;
}

/* ── Nav buttons ─────────────────────────────────────────────────────────── */
.launcher-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: filter 0.15s, background-color 0.15s, border-color 0.15s, color 0.15s;
}

.btn-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.btn-label {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 16px;
}

.btn-sub {
  font-family: 'Figtree', sans-serif;
  font-size: 12px;
  font-weight: 400;
  opacity: 0.7;
}

.btn-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

/* Primary — FOH */
.btn--primary {
  background-color: #1A72FF;
  color: #EEF3FF;
}
.btn--primary:hover {
  filter: brightness(1.1);
}

/* Secondary — Agent */
.btn--secondary {
  background-color: #112035;
  color: #EEF3FF;
  border: 1px solid rgba(26, 114, 255, 0.35);
}
.btn--secondary:hover {
  background-color: #162840;
  border-color: rgba(26, 114, 255, 0.6);
}

/* Kiosk */
.btn--kiosk {
  background-color: #112035;
  color: #EEF3FF;
  border: 1px solid rgba(32, 203, 139, 0.35);
}
.btn--kiosk:hover {
  background-color: #0e2a1e;
  border-color: rgba(32, 203, 139, 0.6);
}

/* Admin */
.btn--admin {
  background-color: #112035;
  color: #EEF3FF;
  border: 1px solid rgba(240, 164, 41, 0.35);
}
.btn--admin:hover {
  background-color: #1c1a0d;
  border-color: rgba(240, 164, 41, 0.6);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
.launcher-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: 'Figtree', sans-serif;
  font-size: 12px;
  color: rgba(238, 243, 255, 0.25);
}

.footer-sep {
  opacity: 0.4;
}

/* ── Debug section ─────────────────────────────────────────────────────── */
.debug-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.debug-btn {
  font-family: 'Figtree', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 16px;
  border-radius: 6px;
  border: 1px solid rgba(240, 164, 41, 0.3);
  background-color: rgba(240, 164, 41, 0.1);
  color: #F0A429;
  cursor: pointer;
  transition: all 0.15s;
}

.debug-btn:hover:not(:disabled) {
  background-color: rgba(240, 164, 41, 0.15);
  border-color: rgba(240, 164, 41, 0.5);
}

.debug-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.debug-result {
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 59, 59, 0.3);
  border-radius: 6px;
  padding: 12px;
}

.debug-result--success {
  border-color: rgba(32, 203, 139, 0.3);
}

.debug-result-status {
  font-family: 'Figtree', sans-serif;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #FF3B3B;
}

.debug-result--success .debug-result-status {
  color: #20CB8B;
}

.debug-result-details {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  margin: 0;
  color: rgba(238, 243, 255, 0.5);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
