<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQueueStore } from '@/queue.js'

const store = useQueueStore()

// ── Clock ─────────────────────────────────────────────────────────────────────
const currentTime = ref('')
function updateClock() {
    const now = new Date()
    currentTime.value = now.toLocaleTimeString('es-DO', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    })
}
let clockTimer
let elapsedTimer
const elapsedDisplay = ref('0 min 0 seg')

function updateElapsed() {
    if (!store.activeTurn?.calledAt) { elapsedDisplay.value = '—'; return }
    const diff = Math.floor((Date.now() - new Date(store.activeTurn.calledAt)) / 1000)
    const m = Math.floor(diff / 60)
    const s = diff % 60
    elapsedDisplay.value = `${m} min ${s} seg`
}

onMounted(() => {
    store.loadFromStorage()
    updateClock()
    clockTimer = setInterval(updateClock, 1000)
    elapsedTimer = setInterval(updateElapsed, 1000)
})
onUnmounted(() => {
    clearInterval(clockTimer)
    clearInterval(elapsedTimer)
})

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

const historyItems = computed(() => store.history.slice(0, 7))

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
function handleKey(e) {
    if (e.code === 'Space' && !store.activeTurn) { e.preventDefault(); store.callNext() }
    if (e.code === 'Enter' && store.activeTurn) { e.preventDefault(); store.finishTurn() }
    if (e.code === 'Escape' && store.activeTurn) { e.preventDefault(); store.skipTurn() }
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
                <div class="next-btn" :class="{ 'boh-call-btn--disabled': !!store.activeTurn }" role="button"
                    tabindex="0" :aria-disabled="!!store.activeTurn" @click="!store.activeTurn && store.callNext()"
                    @keydown.enter="!store.activeTurn && store.callNext()">
                    <div class="next-btn_container">
                        <span class="cta">
                            {{ store.activeTurn ? 'IN PROGRESS' : 'CALL NEXT' }}
                        </span>
                        <div class="status-container">
                            <div class="status">
                                <span class="btn_waiting">
                                    {{ store.stats.waiting }} turn{{ store.stats.waiting !== 1 ? 's' : '' }} waiting
                                </span>
                            </div>
                            <div class="next-details" v-if="store.nextTurn">
                                <span class="next-label">NEXT:</span>
                                <span class="next-info">
                                    {{ store.nextTurn.id }} || {{ store.nextTurn.serviceLabel }}
                                    <span v-if="store.nextTurn?.priority === 'special'" class="boh-priority-tag">
                                        ★ Special</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="btn-kbd" v-if="!store.activeTurn">
                        <kbd>(Space)</kbd>
                    </div>
                </div>

                <template class="turn-summary" v-if="store.activeTurn">
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
                        <button class="mark-no-show-button" @click="store.skipTurn()">Set as No Show
                            <kbd class="btn-kbd">(Esc)</kbd>
                        </button>
                    </div>
                </template>
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
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Figtree:wght@300;400;500;600&display=swap');

header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 24px clamp(16px, 3vw, 24px);
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
}

.main-screen {
    flex: 1;
    min-width: 0;
    background-color: #EEF1F6;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(24px, 3vw, 42px) 0;
    gap: clamp(16px, 2vw, 32px);
}

.info {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(16px, 2.5vw, 40px);
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
    min-height: 200px;
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
    gap: clamp(16px, 2vw, 32px);
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
    gap: clamp(12px, 1.5vw, 24px);
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
    width: 1000px;
    outline: 10px solid #949494;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    text-align: left;
    font-size: 32px;
    color: #000;
    font-family: 'figtree';
}

.active-turn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 clamp(16px, 2.5vw, 32px);
    gap: clamp(16px, 2vw, 32px);
}

.status-title {
    font-family: 'Figtree', sans-serif;
    font-size: clamp(18px, 2vw, 32px);
    font-weight: 600;
    display: contents;
}

.turn {
    font-size: 96px;
    font-family: 'syne';
    color: #949494;
}

.summary-divider {
    width: 90%;
    height: 2px;
    border-top: 2px solid #949494;
    box-sizing: border-box;
}

.info-container {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    flex-wrap: wrap;
    align-content: flex-start;
    padding: 0 clamp(16px, 2.5vw, 32px);
    gap: clamp(16px, 2vw, 32px);
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
    padding: clamp(24px, 3vw, 48px) clamp(16px, 2vw, 32px);
    box-sizing: border-box;
    gap: clamp(16px, 2vw, 32px);
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
    gap: clamp(24px, 2.5vw, 48px);
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
    font-size: clamp(28px, 3.5vw, 48px);
    font-family: 'Syne', sans-serif;
    color: #EEF3FF;
    font-weight: 700;
}

.history {
    flex: 1;
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
    padding: clamp(16px, 2vw, 24px) clamp(12px, 1.5vw, 16px);
    box-sizing: border-box;
    gap: clamp(12px, 1.5vw, 24px);
    text-align: center;
    color: #eef3ff;
    font-family: 'Figtree', sans-serif;
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
    overflow-y: auto;
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
</style>