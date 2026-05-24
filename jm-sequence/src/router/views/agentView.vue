<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQueueStore } from '@/queue.js'

const store = useQueueStore()

// ── Clock ─────────────────────────────────────────────────────────────────────
const currentTime = ref('')
// Reactive timestamp — used for elapsed display AND cooldown countdown
const nowMs = ref(Date.now())

function updateClock() {
    const d = new Date()
    currentTime.value = d.toLocaleTimeString('es-DO', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    })
}
let clockTimer
let elapsedTimer
const elapsedDisplay = ref('0 min 0 seg')

function updateElapsed() {
    nowMs.value = Date.now()  // drives cooldown computeds too
    if (!store.activeTurn?.calledAt) { elapsedDisplay.value = '—'; return }
    const diff = Math.floor((Date.now() - new Date(store.activeTurn.calledAt)) / 1000)
    const m = Math.floor(diff / 60)
    const s = diff % 60
    elapsedDisplay.value = `${m} min ${s} seg`
}

onMounted(() => {
    store.loadFromStorage()
    updateClock()
    clockTimer  = setInterval(updateClock, 1000)
    elapsedTimer = setInterval(updateElapsed, 1000)
})
onUnmounted(() => {
    clearInterval(clockTimer)
    clearInterval(elapsedTimer)
})

// ── 3-Call Protocol ───────────────────────────────────────────────────────────
const COOLDOWN_SECS = 30

const callCount = computed(() => store.activeTurn?.callCount ?? 0)
const lastCalledAt = computed(() => store.activeTurn?.lastCalledAt ?? null)

const cooldownRemaining = computed(() => {
    if (!lastCalledAt.value || callCount.value >= 3) return 0
    const elapsed = (nowMs.value - new Date(lastCalledAt.value).getTime()) / 1000
    return Math.max(0, Math.ceil(COOLDOWN_SECS - elapsed))
})

const isInCooldown = computed(() => cooldownRemaining.value > 0)

// SVG ring: circumference = 2π × r(54) ≈ 339.3
// offset 0 = full ring (cooldown just started), 339.3 = empty (cooldown done)
const RING_CIRCUMFERENCE = 339.3
const ringOffset = computed(() =>
    RING_CIRCUMFERENCE * (1 - cooldownRemaining.value / COOLDOWN_SECS)
)

const ctaLabel = computed(() => {
    if (!store.activeTurn) return 'CALL NEXT'
    if (callCount.value === 1) return 'CALL AGAIN'
    if (callCount.value === 2) return 'LAST CALL'
    return 'MARK NO SHOW'
})

// CTA is disabled while cooldown is running (calls 1 and 2 only)
const ctaDisabled = computed(() => {
    if (!store.activeTurn) return !store.nextTurn
    if (callCount.value >= 3) return false
    return isInCooldown.value
})

// At call-3, the button becomes destructive (amber)
const ctaIsDestructive = computed(() => callCount.value >= 3)

// Last call timestamp formatted for the call indicator
const lastCallTime = computed(() => {
    if (!lastCalledAt.value) return ''
    return new Date(lastCalledAt.value).toLocaleTimeString('es-DO', {
        hour: '2-digit', minute: '2-digit'
    })
})

// ── Confirmation dialog (Esc → no-show override) ──────────────────────────────
const showNoShowConfirm = ref(false)

function confirmNoShow() {
    store.markNoShow(true)
    showNoShowConfirm.value = false
}

function handleCtaClick() {
    if (ctaDisabled.value) return
    if (!store.activeTurn) { store.callNext(); return }
    if (callCount.value < 3) { store.recallTurn(); return }
    store.markNoShow()
}

// Defer the next-in-queue turn: call it briefly then suspend to back of queue.
// Used for kiosk errors or wrong-number situations before the turn is made active.
function deferNextTurn() {
    if (!store.nextTurn) return
    // Temporarily activate the turn so suspendTurn() has an activeTurn to work with
    store.callNext()
    store.suspendTurn()
}

// ── Computed ──────────────────────────────────────────────────────────────────
const agentCounter = computed(() =>
    store.counters.find(c => c.id === store.agentCounterId) || null
)

const counterServices = computed(() => {
    if (!agentCounter.value) return []
    return agentCounter.value.serviceIDs.map(id =>
        store.SERVICES.find(s => s.id === id)?.label || id
    )
})

const historyItems = computed(() => store.history)

// ── Duration helper ───────────────────────────────────────────────────────────
function formatDuration(turn) {
    if (turn.durationMs != null) {
        const totalSec = Math.floor(turn.durationMs / 1000)
        const m = Math.floor(totalSec / 60)
        const s = totalSec % 60
        if (m === 0) return `${s} seg`
        return s === 0 ? `${m} min` : `${m} min ${s} seg`
    }
    if (turn.calledAt) {

        const diff = Math.floor((Date.now() - new Date(turn.calledAt)) / 1000)
        const m = Math.floor(diff / 60)
        const s = diff % 60
        if (m === 0) return `${s} seg`
        return s === 0 ? `${m} min` : `${m} min ${s} seg`
    }
    return '—'
}

// ── History duration formatter (minutes only) ─────────────────────────────────
function formatHistoryDuration(turn) {
    if (turn.durationMs != null) {
        const totalSec = Math.floor(turn.durationMs / 1000)
        const m = Math.floor(totalSec / 60)
        return m === 0 ? '0 min' : `${m} min`
    }
    return '—'
}

// ── Status helpers ────────────────────────────────────────────────────────────
function statusLabel(status) {
    return { attended: 'Attended', skipped: 'No Show', called: 'Called' }[status] || status
}
// Badge colour class
function statusBadgeMod(status) {
    return { attended: 'badge--green', skipped: 'badge--amber', called: 'badge--blue' }[status] || 'badge--gray'
}
// Dot colour class (keeps the existing status-icon dot)
function statusDotMod(status) {
    return { attended: 'dot--green', skipped: 'dot--amber', called: 'dot--blue' }[status] || 'dot--gray'
}


// Keyboard shortcuts
// Space  → call protocol progression (1st, 2nd, 3rd call) — never triggers no-show
// Enter  → finish turn (always, any call state)
// Esc    → no-show path exclusively (shows confirmation dialog if < 3 calls)
function handleKey(e) {
    if (showNoShowConfirm.value) {
        if (e.code === 'Escape') { e.preventDefault(); showNoShowConfirm.value = false }
        if (e.code === 'Enter')  { e.preventDefault(); confirmNoShow() }
        return
    }
    if (e.code === 'Space') {
        e.preventDefault()
        if (!store.activeTurn) { store.callNext(); return }
        if (ctaDisabled.value) return          // blocked during cooldown
        if (callCount.value < 3) store.recallTurn()
        // callCount === 3: Space does nothing — Esc is the only path to no-show
    }
    if (e.code === 'Enter' && store.activeTurn) { e.preventDefault(); store.finishTurn() }
    if (e.code === 'Escape' && store.activeTurn) { e.preventDefault(); showNoShowConfirm.value = true }
}
onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

</script>

<template>
    <div class="foh-container">
        <header class="foh-container">
            <div class="header-title">
                <div class="header-logo">
                    <img class="logo-image" src="@/assets/img/DarioContreras-logo-sm.png" alt="Dario Contreras Logo">
                </div>
                <div class="header-text">
                    <h1 class="hospital-name">Hospital Docente Universitario <br>Dr. Darío Contreras</h1>
                    <p class="system-name">JM Sequence - Turns Sequence</p>
                </div>
            </div>
            <div class="header-username">Anne Hamilton</div>
        </header>

        <section class="boh-content">

            <div class="main-screen">
                <div class="cta-group">
                <div class="info">
                    <div class="info-header">
                        <div class="counter-id">COUNTER <strong>{{ store.agentCounterId }}</strong></div>
                        <div class="services">
                            <span v-for="svc in counterServices" :key="svc" class="boh-badge boh-badge--blue">{{ svc
                            }}</span>
                        </div>
                    </div>
                    <time class="time">{{ currentTime }}</time>
                </div>
                <div
                    class="next-btn"
                    :class="{
                        'next-btn--disabled':    ctaDisabled,
                        'next-btn--destructive': ctaIsDestructive,
                        'next-btn--cooldown':    isInCooldown
                    }"
                    role="button"
                    tabindex="0"
                    :aria-disabled="ctaDisabled"
                    :aria-label="ctaLabel"
                    @click="handleCtaClick"
                    @keydown.space.prevent="handleCtaClick"
                >
                    <!-- Countdown ring — visible only during 30s cooldown -->
                    <svg v-if="isInCooldown" class="countdown-ring" viewBox="0 0 120 120" aria-hidden="true">
                        <circle class="ring-track"    cx="60" cy="60" r="54" />
                        <circle class="ring-progress" cx="60" cy="60" r="54"
                            :style="{ strokeDashoffset: ringOffset }" />
                    </svg>

                    <div class="next-btn_container">
                        <span class="cta">{{ ctaLabel }}</span>

                        <!-- Cooldown sub-label: countdown seconds (Syne monospaced) -->
                        <span v-if="isInCooldown" class="cta-countdown">
                            Available in {{ cooldownRemaining }}s
                        </span>

                        <!-- Normal sub-info: queue stats + next turn preview (idle state) -->
                        <div v-else-if="!store.activeTurn" class="status-container">
                            <div class="status">
                                <span class="btn_waiting">
                                    {{ store.stats.waiting }} turn{{ store.stats.waiting !== 1 ? 's' : '' }} waiting
                                </span>
                            </div>
                            <div class="next-details" v-if="store.nextTurn">
                                <span class="next-label">NEXT:</span>
                                <span class="next-info">
                                    {{ store.nextTurn.id }} · {{ store.nextTurn.serviceLabel }}
                                    <span v-if="store.nextTurn?.priority === 'special'" class="boh-priority-tag">
                                        ★ Special</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <kbd class="btn-kbd" v-if="!store.activeTurn">(Space)</kbd>
                    <kbd class="btn-kbd" v-else-if="!isInCooldown && callCount < 3">(Space)</kbd>
                </div>

                <!-- Call indicator: "Call 2 of 3 · 10:14 AM" -->
                <p v-if="store.activeTurn" class="call-indicator">
                    Call {{ callCount }} of 3
                    <span v-if="lastCallTime" class="call-time"> · {{ lastCallTime }}</span>
                </p>

                <!-- Cancel / Defer next turn (before it becomes active) -->
                <div v-if="!store.activeTurn && store.nextTurn" class="next-turn-mgmt">
                    <button class="btn-ghost-sm" @click="deferNextTurn" title="Defer to back of queue">
                        Defer
                    </button>
                    <button class="btn-ghost-sm btn-ghost-sm--danger" @click="store.cancelTurn(store.nextTurn.id)" title="Cancel erroneous turn">
                        Cancel turn
                    </button>
                </div>
                </div>

                <div class="turn-summary" v-if="store.activeTurn">
                    <div class="active-turn">
                        <div class="status-title"><span>ACTIVE TURN</span>
                            <span class="boh-priority-badge" v-if="store.activeTurn.priority === 'special'">
                                ★ Special Priority</span>
                        </div>
                        <b class="turn">{{ store.activeTurn.id }}</b>
                    </div>
                    <div class="summary-divider">
                    </div>
                    <div class="info-container">
                        <div class="name-info">
                            <div class="status-title">Name:</div>
                            <div class="name-value">{{ store.activeTurn.patientName || '—' }}</div>
                        </div>
                        <div class="name-info">
                            <div class="status-title">ID Number:</div>
                            <div class="name-value">{{ store.activeTurn.idNumber || '—' }}</div>
                        </div>
                        <div class="name-info">
                            <div class="status-title">Special condition:</div>
                            <div class="condition-value">{{ store.activeTurn.specialCondition }}</div>
                        </div>
                        <div class="timing-info">
                            <div class="called-info">
                                <div class="status-title">Called at:</div>
                                <span class="called-value called-time">
                                    {{ store.activeTurn.calledAt
                                        ? new Date(store.activeTurn.calledAt).toLocaleTimeString('es-DO', {
                                            hour: '2-digit',
                                            minute: '2-digit', second: '2-digit', hour12: true
                                        }) : '—' }}
                                </span>
                            </div>
                            <div class="called-info">
                                <div class="status-title">Time elapsed</div>
                                <span class="called-value time-elapsed">{{ elapsedDisplay }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="actions">
                        <button class="end-turn-button" @click="store.finishTurn()">End turn
                            <kbd class="btn-kbd">(Enter)</kbd>
                        </button>
                        <!-- No-show is now reached via Esc or the CTA progression;
                             this button remains as a visible Esc-equivalent for mouse users -->
                        <button class="mark-no-show-button" @click="showNoShowConfirm = true">
                            No Show <kbd class="btn-kbd">(Esc)</kbd>
                        </button>
                    </div>
                </div>
            </div>

            <div class="side-panel">
                <div class="insights">
                    <div class="insight-title">TODAY'S INSIGHTS</div>
                    <div class="insights-container">
                        <div class="data">
                            <div class="turns-called-label">TURNS <br>CALLED</div>
                            <span class="turns-called-value">{{ store.stats.called }}</span>
                        </div>
                        <div class="data">
                            <div class="turns-called-label">TURNS <br>ATTENDED</div>
                            <span class="turns-called-value">{{ store.stats.attended }}</span>
                        </div>
                        <div class="data">
                            <div class="turns-called-label">NO <br>SHOW</div>
                            <span class="turns-called-value">{{ store.stats.skipped }}</span>
                        </div>
                    </div>
                </div>
                <div class="history">
                    <div class="history-container">
                        <div class="history-title">HISTORY</div>
                        <div class="entries-container">
                            <div v-if="historyItems.length === 0" class="boh-history_empty">No history yet</div>
                            <div v-for="turn in historyItems" :key="turn.id + turn.status"
                                class="boh-history_item entry">
                                <div class="entry_left">
                                    <span class="status-dot" :class="statusDotMod(turn.status)"></span>
                                    <span class="entry_code">{{ turn.id }}</span>
                                </div>

                                <div class="entry_center">
                                    <span class="entry_service">{{ turn.serviceLabel }}</span>
                                    <span class="entry_sep">—</span>
                                    <span class="entry_duration">{{ formatHistoryDuration(turn) }}</span>
                                </div>

                                <span class="boh-badge entry_badge" :class="statusBadgeMod(turn.status)">
                                    {{ statusLabel(turn.status) }}
                                </span>

                                <!-- Reinstate: patient arrived after no-show -->
                                <button
                                    v-if="turn.status === 'skipped'"
                                    class="btn-reinstate"
                                    @click.stop="store.reinstateFromHistory(turn.id)"
                                    title="Patient arrived — put back in queue"
                                >↩</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>

    <!-- ── No-Show Confirmation Dialog ────────────────────────────────────── -->
    <Teleport to="body">
        <div v-if="showNoShowConfirm" class="confirm-overlay" @click.self="showNoShowConfirm = false">
            <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
                <p class="confirm-title" id="confirm-title">Mark as No Show?</p>
                <p class="confirm-body">
                    <span v-if="callCount < 3">
                        Protocol not complete ({{ callCount }} of 3 calls made).
                    </span>
                    <span v-else>
                        3 calls completed.
                    </span>
                    This will be recorded in the audit log.
                </p>
                <div class="confirm-actions">
                    <button class="btn-confirm-danger" @click="confirmNoShow">
                        Confirm No Show
                    </button>
                    <button class="btn-confirm-cancel" @click="showNoShowConfirm = false">
                        Cancel
                    </button>
                </div>
                <p class="confirm-hint">Enter to confirm · Esc to cancel</p>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Figtree:wght@300;400;500;600&display=swap');

div.foh-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

body {
    margin: 0;
}

header {
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: clamp(12px, 2vh, 24px) clamp(16px, 3vw, 24px);
    border-bottom: 2px solid white;
    background-color: #07101E;
    box-sizing: border-box;
    width: 100%;
}

.header-title {
    display: flex;
    flex-direction: row;
    gap: clamp(16px, 2.5vw, 32px);
    color: #EEF3FF;
    align-items: center;
}

h1 {
    margin: 0;
    font-family: "Syne";
    font-weight: bold;
    font-size: 24px;
    line-height: 28px;
    color: #EEF3FF;
}

p {
    font-family: "Syne";
    margin: 0;
    font-size: 18px;
    color: #EEF3FF;
}

.hospital-name {
    margin: 0;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: clamp(16px, 1.8vw, 24px);
    line-height: 1.2;
    color: #EEF3FF;
}

.system-name {
    margin: 0;
    font-family: 'Syne', sans-serif;
    font-size: clamp(13px, 1.3vw, 18px);
    color: rgba(238, 243, 255, 0.6);
}

.header-username {
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    font-size: clamp(16px, 1.5vw, 24px);
    color: #EEF3FF;
    white-space: nowrap;
}

.logo-image {
    width: clamp(48px, 5vw, 72px);
    height: clamp(48px, 5vw, 72px);
    flex-shrink: 0;
}

.boh-content {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.main-screen {
    flex: 1;
    min-width: 0;
    min-height: 0;
    background-color: #EEF1F6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: clamp(16px, 3vh, 42px) 0;
    gap: clamp(16px, 3vh, 48px);
    overflow: hidden;
}

.cta-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: clamp(12px, 2vh, 24px);
    flex-shrink: 0;
}

.info {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(8px, 1.5vh, 24px);
    text-align: center;
    font-size: 24px;
    color: #000;
}

.info-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.counter-id {
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    font-size: clamp(16px, 1.5vw, 24px);
}

.services {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
}

.time {
    font-family: 'Figtree';
    font-size: clamp(32px, 4vw, 48px);
    font-weight: 800;
    color: #8D8D8D;
}

.next-btn {
    width: min(480px, 80%);
    min-height: clamp(100px, 18vh, 240px);
    border-radius: 8px;
    background-color: #1057cc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px;
    box-sizing: border-box;
    text-align: center;
    color: white;
    font-family: 'Syne', sans-serif;
    cursor: pointer;
    transition: background-color 0.15s;
}

.next-btn_container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(10px, 1.5vh, 32px);
}

.cta {
    font-size: clamp(22px, 2.5vw, 32px);
    font-weight: 700;
    text-transform: uppercase;
}

.btn-kbd {
    display: block;
    font: 500 12px 'Figtree', sans-serif;
    opacity: 0.7;
}

.status-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(6px, 1vh, 24px);
    font-size: clamp(13px, 1.3vw, 16px);
    font-family: 'Figtree', sans-serif;
}

.next-details {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
}

.next-info {
    flex: 1;
    font-weight: 300;
}

.turn-summary {
    width: min(1000px, 90%);
    border: 10px solid #949494;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 0;
    padding: 0;
    text-align: left;
    font-size: 32px;
    color: #000;
    font-family: 'figtree';
}

.active-turn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(8px, 1.5vh, 16px) clamp(16px, 2.5vw, 32px);
    gap: clamp(16px, 2vw, 32px);
    flex-shrink: 0;
}

.status-title {
    font-family: 'Figtree', sans-serif;
    font-size: clamp(18px, 2vw, 32px);
    font-weight: 600;
    display: contents;
}

.turn {
    font-size: clamp(40px, min(8vw, 9vh), 96px);
    font-family: 'syne';
    color: #949494;
    line-height: 1;
}

.summary-divider {
    width: 90%;
    height: 2px;
    border-top: 2px solid #949494;
    box-sizing: border-box;
    flex-shrink: 0;
}

.info-container {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    flex-wrap: wrap;
    align-content: center;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: clamp(8px, 1.5vh, 16px) clamp(16px, 2.5vw, 32px);
    gap: clamp(10px, 1.5vw, 24px);
    font-size: clamp(16px, 1.6vw, 24px);
}

.name-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.name-value,
.id-value {
    font: 400 clamp(14px, 1.4vw, 20px) 'Figtree', sans-serif;
    color: #000;
}

.condition-value {
    font: 400 clamp(14px, 1.4vw, 20px) 'Figtree', sans-serif;
    color: #92400E;
}

.called-time,
.time-elapsed {
    font: 500 clamp(12px, 1.2vw, 16px) 'Figtree', sans-serif;
    color: #000;
}

.timing-info {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: clamp(14px, 1.5vw, 20px);
    flex-wrap: wrap;
}

.called-info {
    display: flex;
    align-items: center;
    gap: 16px;
}

.called-value {
    font-size: clamp(12px, 1.2vw, 16px);
}

.actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    color: #0E3FA3;
    width: 100%;
    flex-shrink: 0;
}

.end-turn-button {
    height: 48px;
    flex: 1;
    min-width: min(280px, 45%);
    max-width: 500px;
    background-color: #20CB8B;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    box-sizing: border-box;
    color: #0E3FA3;
    font-weight: 500;
    font-family: 'Figtree', sans-serif;
    font-size: clamp(16px, 1.6vw, 24px);
    gap: 16px;
    border: none;
    cursor: pointer;
    transition: filter 0.15s;
}

.end-turn-button:hover {
    filter: brightness(1.05);
}

.mark-no-show-button {
    height: 48px;
    flex: 1;
    min-width: min(280px, 45%);
    max-width: 500px;
    border: 1px solid rgba(255, 255, 255, 0.17);
    background: transparent;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    color: #4B5563;
    font-weight: 500;
    font-family: 'Figtree', sans-serif;
    font-size: clamp(16px, 1.6vw, 24px);
    gap: 16px;
    cursor: pointer;
    transition: background-color 0.15s;
}

.mark-no-show-button:hover {
    background-color: rgba(75, 85, 99, 0.08);
}

.side-panel {
    width: clamp(220px, 20vw, 280px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}

.insights {
    flex-shrink: 0;
    background-color: #112035;
    border-bottom: 2px solid #EEF3FF;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(16px, 2.5vh, 48px) clamp(16px, 2vw, 32px);
    box-sizing: border-box;
    gap: clamp(12px, 2vh, 32px);
    text-align: center;
    color: #eef3ff;
    font-family: 'Figtree', sans-serif;
}

.insight-title {
    font-size: clamp(16px, 1.8vw, 32px);
    font-weight: 600;
    color: #eef3ff;
    text-align: center;
}

.insights-container {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: clamp(12px, 2vh, 48px);
    text-align: left;
    color: #20CB8B;
    width: 100%;
    box-sizing: border-box;
}

.data {
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
}

.turns-called-label {
    font-size: clamp(11px, 1.1vw, 14px);
    font-weight: 500;
    color: #20CB8B;
    line-height: 1.3;
}

.turns-called-value {
    font-size: clamp(24px, min(3.5vw, 5vh), 48px);
    font-family: 'Syne', sans-serif;
    color: #EEF3FF;
    font-weight: 700;
}

.history {
    flex: 1;
    min-height: 0;
    background-color: #0c1828;
    box-sizing: border-box;
    overflow: hidden;
}

.history-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(12px, 1.5vh, 24px) clamp(12px, 1.5vw, 16px);
    box-sizing: border-box;
    gap: clamp(8px, 1vh, 24px);
    text-align: center;
    color: #eef3ff;
    font-family: 'Figtree', sans-serif;
    min-height: 0;
}

.history-title {
    font-size: clamp(14px, 1.5vw, 20px);
    font-weight: 600;
    flex-shrink: 0;
    color: #eef3ff;
}

.entries-container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(238, 243, 255, 0.18) transparent;
}

.entries-container::-webkit-scrollbar {
    width: 4px;
}

.entries-container::-webkit-scrollbar-track {
    background: transparent;
}

.entries-container::-webkit-scrollbar-thumb {
    background-color: rgba(238, 243, 255, 0.18);
    border-radius: 9999px;
}

.entries-container::-webkit-scrollbar-thumb:hover {
    background-color: rgba(26, 114, 255, 0.55);
}

.entry {
    border-radius: 6px;
    background-color: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 8px;
    gap: 6px;
    width: 100%;
    box-sizing: border-box;
}

.entry_left {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.dot--green {
    background-color: #20CB8B;
}

.dot--amber {
    background-color: #F0A429;
}

.dot--blue {
    background-color: #4D93FF;
}

.dot--gray {
    background-color: #6B7280;
}

.entry__code {
    font-family: 'Syne', sans-serif;
    font-size: clamp(11px, 1.1vw, 13px);
    font-weight: 600;
    color: #EEF3FF;
    white-space: nowrap;
}

.entry__center {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.entry_service {
    font-size: clamp(10px, 1vw, 12px);
    color: rgba(238, 243, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.entry_sep {
    font-size: clamp(10px, 1vw, 12px);
    color: rgba(238, 243, 255, 0.3);
    flex-shrink: 0;
}

.entry_duration {
    font-size: clamp(10px, 1vw, 12px);
    color: rgba(238, 243, 255, 0.55);
    white-space: nowrap;
    flex-shrink: 0;
}

.entry_badge {
    flex-shrink: 0;
}

.boh-badge {
    font-family: 'Figtree', sans-serif;
    font-size: clamp(9px, 0.9vw, 11px);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 9999px;
    letter-spacing: 0.02em;
    white-space: nowrap;
}

.boh-call-btn--disabled {
    background: #4B5563;
    box-shadow: 0 8px 32px rgba(16, 38, 185, 0.25);
    cursor: default;
    min-height: clamp(48px, 8vh, 96px);
}

.boh-badge--sm {
    font-size: 8px;
    padding: 2px 7px;
}

.boh-badge--blue {
    background-color: rgba(26, 114, 255, 0.17);
    color: #0E3FA3;
}

.boh-badge--green {
    background-color: rgba(32, 203, 139, 0.17);
    color: #065F46;
}

.boh-badge--amber {
    background-color: rgba(245, 158, 11, 0.17);
    color: #92400E;
}

.boh-badge--gray {
    background-color: rgba(238, 243, 255, 0.17);
    color: #949494;
}

.boh-priority-tag {
    font-size: 12px;
    font-weight: 700;
    color: #FEF3C7;
    background-color: rgba(245, 158, 11, 0.25);
    padding: 2px 7px;
    border-radius: 9999px;
}

.boh-priority-badge {
    font-size: 12px;
    font-weight: 700;
    color: #92400E;
    background-color: rgba(245, 158, 11, 0.17);
    padding: 2px 8px;
    border-radius: 9999px;
    letter-spacing: 0.04em;
}

.boh-history_empty {
    font-size: 12px;
    color: #9CA3AF;
    font-style: italic;
    text-align: center;
    padding: 8px 0;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */

/* Intermediate: tighten side panel below 1100px */
@media (max-width: 1100px) {
    .side-panel {
        width: clamp(180px, 22vw, 240px);
    }
    .turns-called-value {
        font-size: clamp(24px, 3vw, 48px);
    }
    .insight-title {
        font-size: clamp(14px, 1.5vw, 20px);
    }
}

/* Tablet: stack layout vertically at 768px width */
@media (max-width: 768px) {
    .boh-content {
        flex-direction: column;
        overflow-y: auto;
    }

    .main-screen {
        flex: none;
        min-height: 480px;
        justify-content: flex-start;
        padding: 24px 0;
        gap: 16px;
        overflow: visible;
    }

    .side-panel {
        width: 100%;
        flex-direction: row;
        flex-shrink: 0;
        min-height: 0;
        border-top: 2px solid rgba(238, 243, 255, 0.12);
    }

    .insights {
        flex: 1;
        border-bottom: none;
        border-right: 2px solid #EEF3FF;
        padding: 16px;
    }

    .insights-container {
        flex-direction: row;
        justify-content: space-around;
        flex-wrap: wrap;
        gap: 12px;
    }

    .data {
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: 1;
        min-width: 60px;
        text-align: center;
    }

    .turns-called-label {
        text-align: center;
    }

    .turns-called-value {
        font-size: clamp(24px, 6vw, 40px);
    }

    .history {
        flex: 1.5;
        min-height: 0;
        max-height: 220px;
    }

    .next-btn {
        width: min(400px, 90%);
        min-height: clamp(100px, 18vh, 180px);
    }

    .active-turn {
        flex-wrap: wrap;
    }
}

/* ── 3-Call Protocol ────────────────────────────────────────────────────── */

/* Destructive state (call-3 → Mark No Show) */
.next-btn--destructive {
    background-color: #F0A429 !important;
    color: #111827 !important;
}
.next-btn--destructive:hover {
    background-color: #D4901F !important;
}
.next-btn--destructive .ring-progress {
    stroke: #92400E;
}

/* Cooldown disabled state */
.next-btn--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* SVG countdown ring — positioned absolutely over/around the button */
.next-btn {
    position: relative;
}
.countdown-ring {
    position: absolute;
    inset: -10px;
    width: calc(100% + 20px);
    height: calc(100% + 20px);
    pointer-events: none;
    border-radius: inherit;
}
.ring-track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 5;
}
.ring-progress {
    fill: none;
    stroke: rgba(255, 255, 255, 0.7);
    stroke-width: 5;
    stroke-dasharray: 339.3;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dashoffset 1s linear;
}

/* Countdown seconds label inside the CTA */
.cta-countdown {
    display: block;
    font-family: 'Syne', sans-serif;
    font-size: clamp(13px, 1.3vw, 16px);
    font-weight: 500;
    opacity: 0.75;
    margin-top: 4px;
}

/* Call indicator: "Call 2 of 3 · 10:14 AM" */
.call-indicator {
    font-family: 'Figtree', sans-serif;
    font-size: clamp(12px, 1.1vw, 14px);
    color: rgba(17, 24, 39, 0.5);
    margin: 0;
    text-align: center;
}
.call-time {
    font-family: 'Syne', sans-serif;
    font-weight: 600;
}

/* Defer / Cancel next-turn management */
.next-turn-mgmt {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: -4px;
}
.btn-ghost-sm {
    font-family: 'Figtree', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #6B7280;
    background: transparent;
    border: 1px solid rgba(107, 114, 128, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}
.btn-ghost-sm:hover {
    background-color: rgba(107, 114, 128, 0.08);
    color: #374151;
}
.btn-ghost-sm--danger {
    color: #B45309;
    border-color: rgba(180, 83, 9, 0.3);
}
.btn-ghost-sm--danger:hover {
    background-color: rgba(180, 83, 9, 0.06);
    color: #92400E;
}

/* Reinstate button in history (↩) */
.btn-reinstate {
    flex-shrink: 0;
    background: rgba(26, 114, 255, 0.12);
    color: #1A72FF;
    border: none;
    border-radius: 4px;
    width: 22px;
    height: 22px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background-color 0.15s;
    line-height: 1;
}
.btn-reinstate:hover {
    background: rgba(26, 114, 255, 0.22);
}

/* ── No-Show Confirmation Dialog ────────────────────────────────────────── */
.confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
}
.confirm-dialog {
    background: #fff;
    border-radius: 12px;
    padding: 32px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
    text-align: center;
}
.confirm-title {
    font-family: 'Syne', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 12px;
}
.confirm-body {
    font-family: 'Figtree', sans-serif;
    font-size: 14px;
    color: #4B5563;
    margin: 0 0 24px;
    line-height: 1.5;
}
.confirm-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
}
.btn-confirm-danger {
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    font-size: 14px;
    background: #F0A429;
    color: #111827;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    cursor: pointer;
    transition: background-color 0.15s;
}
.btn-confirm-danger:hover { background: #D4901F; }
.btn-confirm-cancel {
    font-family: 'Figtree', sans-serif;
    font-weight: 500;
    font-size: 14px;
    background: transparent;
    color: #6B7280;
    border: 1px solid rgba(107, 114, 128, 0.35);
    border-radius: 8px;
    padding: 10px 20px;
    cursor: pointer;
    transition: background-color 0.15s;
}
.btn-confirm-cancel:hover { background: rgba(107, 114, 128, 0.06); }
.confirm-hint {
    font-family: 'Figtree', sans-serif;
    font-size: 11px;
    color: #9CA3AF;
    margin: 16px 0 0;
}

/* Mobile: aggressively scale at 480px */
@media (max-width: 480px) {
    header {
        padding: 12px 16px;
    }

    h1 {
        font-size: 13px;
        line-height: 1.2;
    }

    .system-name {
        font-size: 11px;
    }

    .logo-image {
        width: 40px;
        height: 40px;
    }

    .side-panel {
        flex-direction: column;
    }

    .insights {
        border-right: none;
        border-bottom: 2px solid #EEF3FF;
    }

    .history {
        max-height: 180px;
    }

    .next-btn {
        width: 95%;
        min-height: 120px;
    }

    .cta {
        font-size: 20px;
    }

    .info-container {
        flex-direction: column;
        align-items: flex-start;
        width: 90%;
        gap: 12px;
    }

    .timing-info {
        gap: 12px;
    }
}
</style>