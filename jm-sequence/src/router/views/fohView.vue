<template>
  <div class="foh-screen">

    <!-- ── Audio activation overlay ──────────────────────────────────── -->
    <div v-if="!audioReady" class="audio-overlay" @click="requestAudioPermission">
      <div class="audio-overlay-inner">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 8L14 18H6v12h8l10 10V8z" fill="#EEF3FF" fill-opacity="0.9"/>
          <path d="M32 16c2.67 2.67 4 5.83 4 9s-1.33 6.33-4 9" stroke="#1A72FF" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M37 11c4 4 6 8.67 6 13s-2 9-6 13" stroke="#1A72FF" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.5"/>
        </svg>
        <p class="audio-overlay-text">{{ locale.t('foh.audioPrompt') }}</p>
      </div>
    </div>

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <header class="foh-header">
      <div class="header-brand">
        <img
          class="header-logo"
          src="@/assets/img/DarioContreras-logo-sm.png"
          alt="Hospital Darío Contreras"
        />
        <div class="header-text">
          <h1 class="hospital-name">Hospital Docente Universitario Dr. Darío Contreras</h1>
          <p class="header-subtitle">{{ locale.t('foh.systemName') }}</p>
        </div>
      </div>
      <time class="header-clock">{{ currentTime }}</time>
    </header>

    <!-- ── Main ───────────────────────────────────────────────────────── -->
    <main class="foh-main">

      <!-- Left column -->
      <div class="left-col">

        <!-- Video zone (placeholder) -->
        <div class="video-zone"></div>

        <!-- Counters carousel -->
        <section class="counters-section">
          <h2 class="section-title">{{ locale.t('foh.counters') }}</h2>
          <div class="counters-row">
            <div
              v-for="counter in store.counters"
              :key="counter.id"
              class="counter-card"
            >
              <span class="counter-label">{{ locale.t('foh.station') }} {{ counter.id }}</span>
              <span class="counter-turn">{{ counter.currentTurnId || '—' }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Right column -->
      <div class="right-col">

        <!-- Active turn panel -->
        <section class="active-section">
          <h2 class="section-title">{{ locale.t('foh.activeCall') }}</h2>

          <div v-if="lastCalledTurn" class="active-display">
            <div class="active-turn-col">
              <span class="active-label">{{ locale.t('foh.turn') }}</span>
              <span class="active-number">{{ lastCalledTurn.id }}</span>
              <span class="active-service">{{ lastCalledTurn.serviceLabel }}</span>
            </div>

            <div class="active-arrow">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="23" stroke="#1A72FF" stroke-width="2"/>
                <path d="M18 24H30M30 24L25 19M30 24L25 29" stroke="#1A72FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <div class="active-station-col">
              <span class="active-label">{{ locale.t('foh.station2') }}</span>
              <span class="active-number">{{ activeCounterId }}</span>
            </div>
          </div>

          <div v-else class="active-idle">
            <span>{{ locale.t('foh.noActiveTurn') }}</span>
          </div>
        </section>

        <!-- History panel -->
        <section class="history-section">
          <h2 class="section-title">{{ locale.t('foh.lastTurns') }}</h2>
          <div class="history-list">
            <div
              v-for="turn in displayHistory"
              :key="turn.id"
              class="history-item"
            >
              <div class="history-left">
                <span class="history-dot" :class="dotClass(turn.status)"></span>
                <span class="history-turn-id">{{ turn.id }}</span>
              </div>
              <div class="history-center">
                <span class="history-service">{{ turn.serviceLabel }}</span>
                <span class="history-arrow">→</span>
                <span class="history-station">{{ turn.counterId ?? '—' }}</span>
              </div>
              <span class="history-badge" :class="badgeClass(turn.status)">
                {{ statusLabel(turn.status) }}
              </span>
            </div>
          </div>
        </section>

      </div>
    </main>

    <!-- ── Footer ─────────────────────────────────────────────────────── -->
    <footer class="foh-footer">
      <div class="footer-badge">JM Sequence</div>
      <div class="ticker-wrapper">
        <p class="ticker-text">
          {{ locale.t('foh.ticker') }}
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          {{ locale.t('foh.ticker') }}
        </p>
      </div>
    </footer>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useQueueStore } from '@/queue'
import { useTurnAnnouncer } from '@/composables/useTurnAnnouncer'
import { useLocaleStore } from '@/locale.js'

const store  = useQueueStore()
const locale = useLocaleStore()
const { announce, audioReady, requestAudioPermission } = useTurnAnnouncer()

// Guard: skip announcing the turn that was already active when the page loads
const mountComplete = ref(false)

// Persist last called turn so the panel never goes blank between turns
const lastCalledTurn = ref(store.activeTurn ? { ...store.activeTurn } : null)

// Keep display panel in sync — no announcement logic here
watch(() => store.activeTurn, (newVal) => {
  if (newVal) lastCalledTurn.value = { ...newVal }
})

// Announce ONLY when callSeq increments (callNext / recallTurn).
// callSeq is a primitive number — Vue skips this watcher entirely when reinstate,
// defer, finish, or any other broadcast sends the same seq value back.
watch(() => store.callSeq, () => {
  if (!mountComplete.value) return
  const turn = store.activeTurn
  if (!turn) return
  announce(turn, (turn.callCount ?? 1) > 1)
})

// Live clock
const currentTime = ref('')
let clockTimer

function updateClock() {
  const now = new Date()
  const h = now.getHours()
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  currentTime.value = `${h12}:${m}:${s} ${ampm}`
}

onMounted(async () => {
  // Wait for any pending watch callbacks before enabling announcements —
  // prevents announcing a turn that was already active when the page loaded.
  await nextTick()
  mountComplete.value = true
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  clearInterval(clockTimer)
})

// Last 8 non-waiting turns — includes 'called' so patients can catch up
const displayHistory = computed(() => store.history.slice(0, 8))

// Use counterId stored on the turn itself — stays valid after the turn is finished
const activeCounterId = computed(() =>
  lastCalledTurn.value?.counterId ?? store.agentCounterId
)

function dotClass(status) {
  if (status === 'attended') return 'dot--green'
  if (status === 'skipped')  return 'dot--amber'
  if (status === 'called')   return 'dot--blue'
  return 'dot--gray'
}

function statusLabel(status) {
  const map = {
    attended: 'common.status.attended',
    skipped:  'common.status.noshow',
    called:   'common.status.called',
  }
  return locale.t(map[status] ?? status)
}

function badgeClass(status) {
  if (status === 'attended') return 'badge--green'
  if (status === 'skipped')  return 'badge--amber'
  if (status === 'called')   return 'badge--blue'
  return 'badge--gray'
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300..900&family=Syne:wght@400..800&display=swap');

/* ── Design tokens ──────────────────────────────────────────────────── */
:root {
  --bg-base:         #07101E;
  --bg-surface:      #0C1828;
  --bg-elevated:     #112035;
  --text-primary:    #EEF3FF;
  --text-secondary:  rgba(238, 243, 255, 0.60);
  --text-tertiary:   rgba(238, 243, 255, 0.32);
  --active-green:    #0F9E69;
  --blue-600:        #1057CC;
  --brand-blue:      #1A72FF;
  --border:          rgba(255, 255, 255, 0.12);
  --border-visible:  rgba(225, 233, 236, 0.60);
}

/* ── Root screen ────────────────────────────────────────────────────── */
.foh-screen {
  position: relative;
  width: 1920px;
  height: 1080px;
  display: grid;
  grid-template-rows: 152px 1fr 40px;
  background-color: #07101E;
  font-family: 'Figtree', sans-serif;
  color: #EEF3FF;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────────────── */
.foh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  background-color: #0C1828;
  border-bottom: 2px solid rgba(225, 233, 236, 0.60);
  box-sizing: border-box;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 32px;
}

.header-logo {
  width: 96px;
  height: 96px;
  object-fit: contain;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hospital-name {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #EEF3FF;
  line-height: 1.1;
}

.header-subtitle {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 300;
  font-size: 24px;
  color: rgba(238, 243, 255, 0.60);
}

.header-clock {
  font-family: 'Figtree', sans-serif;
  font-weight: 800;
  font-size: 32px;
  color: rgba(238, 243, 255, 0.60);
  white-space: nowrap;
}

/* ── Main layout ─────────────────────────────────────────────────────── */
.foh-main {
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* ── Left column ─────────────────────────────────────────────────────── */
.left-col {
  width: 1192px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 2px solid rgba(225, 233, 236, 0.60);
}

/* Video zone placeholder */
.video-zone {
  flex: 1;
  background-color: #07101E;
  border-bottom: 2px solid rgba(225, 233, 236, 0.60);
}

/* Counters section */
.counters-section {
  padding: 16px 24px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  margin: 0;
  font-family: 'Figtree', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #0F9E69;
}

.counters-row {
  display: flex;
  flex-direction: row;
  gap: 32px;
  overflow: hidden;
}

.counter-card {
  width: 263px;
  height: 160px;
  background-color: #112035;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.counter-label {
  font-family: 'Figtree', sans-serif;
  font-weight: 400;
  font-size: 32px;
  color: rgba(238, 243, 255, 0.60);
}

.counter-turn {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 64px;
  color: #EEF3FF;
  line-height: 1;
}

/* ── Right column ────────────────────────────────────────────────────── */
.right-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Active turn panel */
.active-section {
  height: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px 24px 48px;
  border-bottom: 2px solid rgba(225, 233, 236, 0.60);
  background-color: #112035;
  box-sizing: border-box;
}

.active-section .section-title {
  font-size: 48px;
  align-self: center;
}

.active-display {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0;
  width: 100%;
  justify-content: center;
}

.active-turn-col,
.active-station-col {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.active-label {
  font-family: 'Figtree', sans-serif;
  font-weight: 500;
  font-size: 32px;
  color: rgba(238, 243, 255, 0.32);
  line-height: 1;
}

.active-number {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: clamp(64px, 9vw, 128px);
  color: #EEF3FF;
  line-height: 0.85;
}

.active-service {
  font-family: 'Figtree', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: rgba(238, 243, 255, 0.60);
  text-align: left;
}

.active-arrow {
  align-self: center;
  margin: 0 24px;
  flex-shrink: 0;
}

.active-idle {
  font-family: 'Figtree', sans-serif;
  font-weight: 400;
  font-size: 32px;
  color: rgba(238, 243, 255, 0.32);
  text-align: center;
}

/* History panel */
.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 32px;
  overflow: hidden;
  box-sizing: border-box;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.history-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background-color: #112035;
  border-radius: 8px;
  padding: 16px 24px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.history-left {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
}

.history-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot--green { background-color: #0F9E69; }
.dot--amber { background-color: #F0A429; }
.dot--blue  { background-color: #1A72FF; }
.dot--gray  { background-color: rgba(238, 243, 255, 0.20); }

.history-turn-id {
  font-family: 'Figtree', sans-serif;
  font-weight: 600;
  font-size: 28px;
  color: #EEF3FF;
  white-space: nowrap;
}

.history-center {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  font-family: 'Figtree', sans-serif;
  font-weight: 400;
  font-size: 24px;
  color: rgba(238, 243, 255, 0.60);
  white-space: nowrap;
}

.history-arrow {
  color: #1A72FF;
  font-size: 20px;
}

.history-station {
  font-weight: 600;
  color: rgba(238, 243, 255, 0.80);
}

.history-badge {
  font-family: 'Figtree', sans-serif;
  font-weight: 700;
  font-size: 20px;
  padding: 4px 16px;
  border-radius: 9999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge--green {
  background-color: rgba(15, 158, 105, 0.20);
  color: #0F9E69;
}

.badge--amber {
  background-color: rgba(240, 164, 41, 0.20);
  color: #F0A429;
}

.badge--blue {
  background-color: rgba(26, 114, 255, 0.20);
  color: #4D93FF;
}

.badge--gray {
  background-color: rgba(238, 243, 255, 0.10);
  color: rgba(238, 243, 255, 0.50);
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.foh-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 40px;
  overflow: hidden;
}

.footer-badge {
  flex-shrink: 0;
  width: 287px;
  height: 40px;
  background-color: #EEF1F6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Figtree', sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: #1A72FF;
  white-space: nowrap;
}

.ticker-wrapper {
  flex: 1;
  height: 40px;
  background-color: #1057CC;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.ticker-text {
  margin: 0;
  padding: 0 48px;
  font-family: 'Figtree', sans-serif;
  font-weight: 400;
  font-size: 24px;
  color: #EEF3FF;
  white-space: nowrap;
  animation: ticker-scroll 40s linear infinite;
  will-change: transform;
}

@keyframes ticker-scroll {
  from { transform: translateX(100%); }
  to   { transform: translateX(-100%); }
}

/* ── Audio activation overlay ────────────────────────────────────────── */
.audio-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background-color: rgba(7, 16, 30, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(2px);
}

.audio-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.audio-overlay-text {
  margin: 0;
  font-family: 'Figtree', sans-serif;
  font-weight: 500;
  font-size: 28px;
  color: rgba(238, 243, 255, 0.70);
  letter-spacing: 0.02em;
}
</style>
