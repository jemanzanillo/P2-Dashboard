<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQueueStore } from '@/queue'
import { useLocaleStore } from '@/locale.js'

const store  = useQueueStore()
const locale = useLocaleStore()

// ── Step state machine ────────────────────────────────────────────────────────
const step = ref('idle')          // idle | service | patient-data | confirm | success

// ── Form state ────────────────────────────────────────────────────────────────
const selectedService    = ref(null)
const patientName        = ref('')
const idNumber           = ref('')
const selectedConditions = ref([])
const createdTurn        = ref(null)

// ── Auto-reset countdown ──────────────────────────────────────────────────────
const resetCountdown = ref(15)
let resetTimer = null

// ── Conditions (from DB via store) ───────────────────────────────────────────
const CONDITIONS = computed(() =>
  store.conditions.map(c => ({ id: c.id, label: c.nombre, icono: c.icono }))
)

onMounted(() => store.init())

// ── Service icons (inline SVG paths) ─────────────────────────────────────────
const SERVICE_ICONS = {
  A: 'M9 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 7h6m-6 4h4',
  C: 'M4.5 12.5a8 8 0 0 1 8-8 8 8 0 0 1 8 8M12.5 8v4l2.5 2.5M12.5 4.5V3M4.5 12.5H3M22 12.5h-1.5',
  E: 'M13 2 4.09 12.26a1 1 0 0 0 .74 1.74H11l-1 8 8.91-10.26a1 1 0 0 0-.74-1.74H13l1-8z',
  L: 'M9 3h6v7l3.5 9.5A1 1 0 0 1 17.55 21H6.45a1 1 0 0 1-.95-1.5L9 10V3zM6 3h12',
  P: 'M12 2a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 10v4m-2-2h4',
  R: 'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-4 9s-1 0-1 2v4h2v3h2v-3h2v3h2v-3h2v-4c0-2-1-2-1-2h-8z',
  S: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z',
  X: 'M4.5 4.5l15 15m0-15-15 15M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
}

// ── Computed ──────────────────────────────────────────────────────────────────
const waitingByService = computed(() => {
  const map = {}
  for (const s of store.services) {
    map[s.id] = store.turns.filter(
      t => t.serviceID === s.id && (t.status === 'waiting' || t.status === 'deferred')
    ).length
  }
  return map
})

const activeCountersByService = computed(() => {
  const map = {}
  for (const s of store.services) {
    map[s.id] = store.counters.filter(
      c => c.serviceIDs.includes(s.id) && c.status === 'active'
    ).length
  }
  return map
})

const isPriority = computed(() => selectedConditions.value.length > 0)

const hasAnyData = computed(() =>
  patientName.value.trim() !== '' ||
  idNumber.value.trim() !== '' ||
  selectedConditions.value.length > 0
)

const rightBtnLabel = computed(() => {
  if (step.value === 'patient-data') return hasAnyData.value ? locale.t('common.continue') : locale.t('common.skip')
  return locale.t('common.continue')
})

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(s) { step.value = s }

function onIdleTap() { goTo('service') }

function onServiceBack()    { goTo('idle') }
function onServiceContinue() {
  if (!selectedService.value) return
  goTo('patient-data')
}

function onPatientBack()    { goTo('service') }
function onPatientContinue() { goTo('confirm') }

function onConfirmBack() { goTo('patient-data') }
async function onConfirmPrint() {
  const turn = await store.createTurn(
    selectedService.value.id,
    patientName.value.trim() || '',
    idNumber.value.trim() || '',
    selectedConditions.value,
  )
  createdTurn.value = { ...turn, serviceID: selectedService.value.id, serviceName: selectedService.value.nombre }
  goTo('success')
  startResetTimer()
}

// ── Service card ──────────────────────────────────────────────────────────────
function selectService(s) {
  if (activeCountersByService.value[s.id] > 0) selectedService.value = s
}

// ── Condition chips ───────────────────────────────────────────────────────────
function toggleCondition(id) {
  const idx = selectedConditions.value.indexOf(id)
  if (idx >= 0) selectedConditions.value.splice(idx, 1)
  else selectedConditions.value.push(id)
}

// ── Reset countdown ───────────────────────────────────────────────────────────
function startResetTimer() {
  resetCountdown.value = 15
  resetTimer = setInterval(() => {
    resetCountdown.value--
    if (resetCountdown.value <= 0) resetToIdle()
  }, 1000)
}

function resetToIdle() {
  clearInterval(resetTimer)
  resetTimer = null
  step.value            = 'idle'
  selectedService.value = null
  patientName.value     = ''
  idNumber.value        = ''
  selectedConditions.value = []
  createdTurn.value     = null
  resetCountdown.value  = 15
}

onUnmounted(() => clearInterval(resetTimer))

// ── Help overlay ──────────────────────────────────────────────────────────────
const showHelp = ref(false)
</script>

<template>
  <div class="kiosk">

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- IDLE                                                                   -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <div v-if="step === 'idle'" class="screen screen--idle" @click="onIdleTap">
      <div class="idle-center">
        <div class="idle-logo">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <rect width="56" height="56" rx="16" fill="#1A72FF" fill-opacity="0.12"/>
            <path d="M28 14v28M14 28h28" stroke="#1A72FF" stroke-width="3.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 class="idle-title">{{ locale.t('kiosk.welcome') }}</h1>
        <p class="idle-sub">{{ locale.t('kiosk.tapToCreate') }}</p>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- CHOOSE SERVICE                                                         -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'service'" class="screen screen--service">

      <nav class="topnav">
        <button class="btn-ghost" @click="onServiceBack">{{ locale.t('common.home') }}</button>
        <button
          class="btn-primary"
          :disabled="!selectedService"
          @click="onServiceContinue"
        >{{ locale.t('common.continue') }}</button>
      </nav>

      <div class="screen-body">
        <header class="screen-header">
          <h2 class="screen-title">{{ locale.t('kiosk.chooseService') }}</h2>
          <p class="screen-sub">{{ locale.t('kiosk.selectArea') }}</p>
        </header>

        <div class="service-grid">
          <button
            v-for="s in store.services"
            :key="s.id"
            class="service-card"
            :class="{
              'service-card--selected':  selectedService?.id === s.id,
              'service-card--inactive':  activeCountersByService[s.id] === 0,
            }"
            @click="selectService(s)"
          >
            <div
              class="service-icon"
              :style="activeCountersByService[s.id] > 0
                ? { background: (s.color_token || '#1A72FF') + '1a' }
                : { background: '#F3F4F6' }"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                :stroke="activeCountersByService[s.id] > 0 ? (s.color_token || '#1A72FF') : '#9CA3AF'"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path :d="SERVICE_ICONS[s.prefijo_turno]"/>
              </svg>
            </div>
            <span class="service-name">{{ s.nombre }}</span>
            <template v-if="activeCountersByService[s.id] > 0">
              <span class="service-waiting">{{ waitingByService[s.id] }} {{ locale.t('kiosk.waiting') }}</span>
              <span class="service-counters">
                {{ activeCountersByService[s.id] }}
                {{ activeCountersByService[s.id] !== 1 ? locale.t('kiosk.counterPlural') : locale.t('kiosk.counterSingular') }}
              </span>
            </template>
            <span v-else class="service-unavailable-badge">{{ locale.t('kiosk.unavailable') }}</span>
          </button>
        </div>

        <div class="help-row">
          <button class="btn-help" @click="showHelp = true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
            </svg>
            {{ locale.t('kiosk.needHelp') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- PATIENT DATA (optional)                                                -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'patient-data'" class="screen screen--data">

      <nav class="topnav">
        <button class="btn-ghost" @click="onPatientBack">{{ locale.t('common.back') }}</button>
        <button class="btn-primary" @click="onPatientContinue">{{ rightBtnLabel }}</button>
      </nav>

      <div class="screen-body screen-body--data">
        <header class="screen-header">
          <h2 class="screen-title">{{ locale.t('kiosk.optionalInfo') }}</h2>
          <p class="screen-sub">{{ locale.t('kiosk.optionalSub') }}</p>
        </header>

        <div class="form-stack">

          <div class="form-field" :class="{ 'form-field--active': patientName }">
            <label class="form-label">{{ locale.t('kiosk.fullName') }}</label>
            <input
              v-model="patientName"
              class="form-input"
              type="text"
              placeholder="Ej. María García López"
              autocomplete="off"
            />
          </div>

          <div class="form-field" :class="{ 'form-field--active': idNumber }">
            <label class="form-label">{{ locale.t('kiosk.idPassport') }}</label>
            <input
              v-model="idNumber"
              class="form-input"
              type="text"
              placeholder="Ej. 001-2345678-9"
              autocomplete="off"
            />
          </div>

          <div class="form-field">
            <label class="form-label">{{ locale.t('kiosk.specialConditions') }}</label>
            <div class="chip-row">
              <button
                v-for="c in CONDITIONS"
                :key="c.id"
                class="chip"
                :class="{ 'chip--selected': selectedConditions.includes(c.id) }"
                @click="toggleCondition(c.id)"
              >{{ c.label }}</button>
            </div>
          </div>

        </div>
      </div>

      <footer class="kiosk-footer">{{ locale.t('kiosk.footer') }}</footer>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- CONFIRM                                                                -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'confirm'" class="screen screen--confirm">

      <nav class="topnav">
        <button class="btn-ghost" @click="onConfirmBack">{{ locale.t('common.back') }}</button>
        <button class="btn-primary btn-primary--green" @click="onConfirmPrint">{{ locale.t('common.print') }}</button>
      </nav>

      <div class="screen-body screen-body--center">
        <header class="screen-header">
          <h2 class="screen-title">{{ locale.t('kiosk.confirmTitle') }}</h2>
          <p class="screen-sub">{{ locale.t('kiosk.confirmSub') }}</p>
        </header>

        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-label">{{ locale.t('kiosk.requestedService') }}</span>
            <span class="summary-value">{{ selectedService?.nombre }}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span class="summary-label">{{ locale.t('kiosk.patientsWaiting') }}</span>
            <span class="summary-value">
              {{ waitingByService[selectedService?.id] }}
              {{ waitingByService[selectedService?.id] !== 1 ? locale.t('kiosk.patientPlural') : locale.t('kiosk.patientSingular') }}
            </span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span class="summary-label">{{ locale.t('kiosk.priority') }}</span>
            <span class="summary-value" :class="isPriority ? 'summary-value--special' : 'summary-value--normal'">
              {{ isPriority ? locale.t('kiosk.prioritySpecial') : locale.t('kiosk.priorityRegular') }}
            </span>
          </div>
          <template v-if="patientName.trim()">
            <div class="summary-divider"></div>
            <div class="summary-row">
              <span class="summary-label">{{ locale.t('kiosk.name') }}</span>
              <span class="summary-value">{{ patientName.trim() }}</span>
            </div>
          </template>
          <template v-if="idNumber.trim()">
            <div class="summary-divider"></div>
            <div class="summary-row">
              <span class="summary-label">{{ locale.t('kiosk.id') }}</span>
              <span class="summary-value">{{ idNumber.trim() }}</span>
            </div>
          </template>
          <template v-if="selectedConditions.length > 0">
            <div class="summary-divider"></div>
            <div class="summary-row">
              <span class="summary-label">{{ locale.t('kiosk.condition') }}</span>
              <span class="summary-value">
                {{ CONDITIONS.filter(c => selectedConditions.includes(c.id)).map(c => c.label).join(', ') }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <footer class="kiosk-footer">{{ locale.t('kiosk.footer') }}</footer>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- SUCCESS                                                                -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'success'" class="screen screen--success">
      <div class="success-center">

        <div class="success-check">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="rgba(32,203,139,0.12)"/>
            <path d="M14 24l7 7 13-14" stroke="#20CB8B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <p class="success-eyebrow">{{ locale.t('kiosk.yourTicket') }}</p>
        <div class="success-number">{{ createdTurn?.id }}</div>
        <p class="success-service">{{ createdTurn?.serviceName }}</p>
        <p class="success-instruction">{{ locale.t('kiosk.goWaitingRoom') }}</p>

        <div class="success-divider"></div>

        <div class="success-bar-wrap">
          <div
            class="success-bar"
            :style="{ width: (resetCountdown / 15 * 100) + '%' }"
          ></div>
        </div>
        <p class="success-countdown">{{ locale.t('kiosk.returningIn') }} {{ resetCountdown }}s...</p>

        <button class="btn-ghost btn-ghost--light" @click="resetToIdle">{{ locale.t('kiosk.returnHome') }}</button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <!-- HELP OVERLAY                                                           -->
    <!-- ══════════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <div v-if="showHelp" class="overlay" @click.self="showHelp = false">
        <div class="overlay-card">
          <div class="overlay-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
            </svg>
          </div>
          <h3 class="overlay-title">{{ locale.t('kiosk.helpTitle') }}</h3>
          <p class="overlay-body">{{ locale.t('kiosk.helpBody') }}</p>
          <button class="btn-primary overlay-btn" @click="showHelp = false">{{ locale.t('kiosk.understood') }}</button>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Figtree:wght@300;400;500;600&display=swap');

/* ── Root ─────────────────────────────────────────────────────────────────── */
.kiosk {
  width: 100%;
  height: 100vh;
  height: 100dvh; /* dynamic viewport: avoids browser chrome on mobile */
  overflow: hidden;
  background: #EEF1F6;
  font-family: 'Figtree', sans-serif;
  position: relative;
  user-select: none;
}

/* ── Screens ──────────────────────────────────────────────────────────────── */
.screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* ── Idle ─────────────────────────────────────────────────────────────────── */
.screen--idle {
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.screen--idle:active { background: #e6eaf0; }

.idle-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.idle-logo {
  width: 96px;
  height: 96px;
  border-radius: 24px;
  background: rgba(26, 114, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.idle-title {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: clamp(32px, 5vw, 48px);
  color: #111827;
  letter-spacing: 0.03em;
}

.idle-sub {
  margin: 0;
  font-family: 'Figtree', sans-serif;
  font-size: clamp(16px, 2.5vw, 22px);
  color: #4B5563;
}

/* ── Top nav ──────────────────────────────────────────────────────────────── */
.topnav {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: #EEF1F6;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.btn-ghost {
  background: #D9D9D9;
  color: #111827;
  font-family: 'Figtree', sans-serif;
  font-size: 15px;
  font-weight: 600;
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-ghost:hover { background: #C8C8C8; }
.btn-ghost--light {
  background: rgba(0,0,0,0.07);
  margin-top: 8px;
}

.btn-primary {
  background: #1A72FF;
  color: #EEF3FF;
  font-family: 'Figtree', sans-serif;
  font-size: 15px;
  font-weight: 600;
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: filter 0.15s, opacity 0.15s;
}
.btn-primary:hover  { filter: brightness(1.1); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-primary--green { background: #10B981; }

/* ── Screen body ──────────────────────────────────────────────────────────── */
.screen-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 32px 16px;
  overflow: hidden;
  gap: 16px;
}
.screen-body--data {
  padding: 20px clamp(24px, 7vw, 72px) 16px;
  gap: 20px;
}
.screen-body--center {
  align-items: center;
}

.screen-header {
  text-align: center;
  flex-shrink: 0;
}

.screen-title {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 600;
  font-size: clamp(20px, 3vw, 26px);
  color: #111827;
}

.screen-sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: #4B5563;
}

/* ── Service grid ─────────────────────────────────────────────────────────── */
.service-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  flex: 1;
  overflow: hidden;
}

/* Portrait tablets: 2-column grid, allow vertical scroll if cards overflow */
@media (orientation: portrait) {
  .service-grid {
    grid-template-columns: repeat(2, 1fr);
    overflow-y: auto;
  }
  .screen-body {
    padding-left: clamp(16px, 4vw, 32px);
    padding-right: clamp(16px, 4vw, 32px);
  }
  .screen-body--data {
    padding-left: clamp(16px, 5vw, 48px);
    padding-right: clamp(16px, 5vw, 48px);
  }
}

.service-card {
  background: #FFFFFF;
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
  min-height: 0;
}
.service-card:hover:not(.service-card--inactive) {
  border-color: rgba(26, 114, 255, 0.3);
}
.service-card--selected {
  border-color: #1A72FF;
  background: rgba(26, 114, 255, 0.06);
}
.service-card--inactive {
  background: #F3F4F6;
  cursor: not-allowed;
}
.service-card--inactive .service-name {
  color: #9CA3AF;
}

.service-unavailable-badge {
  font-size: 11px;
  font-weight: 600;
  color: #9CA3AF;
  background: #E5E7EB;
  border-radius: 9999px;
  padding: 3px 10px;
  letter-spacing: 0.03em;
}

.service-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.service-name {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: #111827;
  line-height: 1.2;
}

.service-waiting {
  font-size: 12px;
  color: #4B5563;
}

.service-counters {
  font-size: 11px;
  color: #9CA3AF;
}

/* ── Help row ─────────────────────────────────────────────────────────────── */
.help-row {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding-bottom: 4px;
}

.btn-help {
  background: #92400E;
  color: #FEF3C7;
  font-family: 'Figtree', sans-serif;
  font-size: 16px;
  font-weight: 600;
  padding: 12px 32px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: filter 0.15s;
}
.btn-help:hover { filter: brightness(1.1); }

/* ── Patient data form ────────────────────────────────────────────────────── */
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.form-field {
  background: #FFFFFF;
  border-radius: 10px;
  padding: 14px 24px;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}
.form-field--active {
  border-color: #1A72FF;
}

.form-label {
  display: block;
  font-family: 'Syne', sans-serif;
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9CA3AF;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-family: 'Figtree', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  box-sizing: border-box;
}
.form-input::placeholder { color: #D1D5DB; font-weight: 400; }

/* ── Condition chips ──────────────────────────────────────────────────────── */
.chip-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.chip {
  background: #FFFFFF;
  border: 1.5px solid #D1D5DB;
  border-radius: 20px;
  padding: 8px 18px;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #4B5563;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.chip--selected {
  border-color: #1A72FF;
  color: #1A72FF;
  background: rgba(26, 114, 255, 0.06);
}

/* ── Summary card ─────────────────────────────────────────────────────────── */
.summary-card {
  background: #FFFFFF;
  border-radius: 14px;
  padding: 28px 36px;
  width: min(480px, 90%);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.summary-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
}

.summary-label {
  font-family: 'Syne', sans-serif;
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9CA3AF;
}

.summary-value {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: #111827;
}
.summary-value--special { color: #92400E; }
.summary-value--normal  { color: #4B5563; }

.summary-divider {
  height: 1px;
  background: #F3F4F6;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.kiosk-footer {
  text-align: center;
  font-size: 13px;
  color: #9CA3AF;
  padding: 10px 0 14px;
  flex-shrink: 0;
}

/* ── Success ──────────────────────────────────────────────────────────────── */
.screen--success {
  align-items: center;
  justify-content: center;
}

.success-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.success-check { margin-bottom: 4px; }

.success-eyebrow {
  margin: 0;
  font-size: 18px;
  color: #4B5563;
}

.success-number {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: clamp(64px, 14vw, 100px);
  color: #1A72FF;
  line-height: 1;
  letter-spacing: -2px;
}

.success-service {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 600;
  font-size: 22px;
  color: #111827;
}

.success-instruction {
  margin: 0;
  font-size: 18px;
  color: #4B5563;
}

.success-divider {
  width: min(320px, 80%);
  height: 1px;
  background: rgba(0,0,0,0.1);
  margin: 6px 0;
}

.success-bar-wrap {
  width: min(320px, 80%);
  height: 4px;
  background: rgba(26, 114, 255, 0.15);
  border-radius: 9999px;
  overflow: hidden;
}
.success-bar {
  height: 100%;
  background: #1A72FF;
  border-radius: 9999px;
  transition: width 1s linear;
}

.success-countdown {
  margin: 0;
  font-size: 13px;
  color: #9CA3AF;
}

/* ── Help overlay ─────────────────────────────────────────────────────────── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.overlay-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 40px 48px;
  max-width: 420px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.overlay-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #FEF3C7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-title {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 22px;
  color: #111827;
}

.overlay-body {
  margin: 0;
  font-size: 16px;
  color: #4B5563;
  line-height: 1.5;
}

.overlay-btn {
  margin-top: 8px;
  padding: 12px 36px;
  font-size: 16px;
}
</style>
