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

// Keyboard shortcuts
function handleKey(e) {
    if (e.code === 'Space' && !store.activeTurn) { e.preventDefault(); store.callNext() }
    if (e.code === 'Enter' && store.activeTurn) { e.preventDefault(); store.finishTurn() }
    if (e.code === 'Escape' && store.activeTurn) { e.preventDefault(); store.skipTurn() }
}
onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

function statusLabel(status) {
    return { attended: 'Attended', skipped: 'Skipped', called: 'Called' }[status] || status
}
function statusMod(status) {
    return { attended: 'badge--green', skipped: 'badge--amber', called: 'badge--blue' }[status] || 'badge--gray'
}
</script>

<template>
    <div class="foh-container">
        <header class="foh-container">
            <div class="header-title">
                <div class="header-logo">
                    <img class="logo-image" src="@/assets/img/DarioContreras-logo-sm.png"
                        alt="Dario Contreras Logo">
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
                    <div class="header">
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
                    <div class="container">
                        <span class="cta">
                            {{ store.activeTurn ? 'IN PROGRESS' : 'CALL NEXT' }}
                        </span>
                        <div class="status-container">
                            <div class="status">
                                <span class="btn__waiting">
                                    {{ store.stats.waiting }} turn{{ store.stats.waiting !== 1 ? 's' : '' }} waiting
                                </span>
                            </div>
                            <div class="next-details">
                                <span class="next-label">NEXT:</span>
                                <span class="next-info">
                                    {{ store.nextTurn.id }} | {{ store.nextTurn.serviceLabel }}
                                    <span v-if="store.nextTurn.priority === 'special'" class="boh-priority-tag">★
                                        Special</span>
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
                    <div class="insight-title">TODAY’S INSIGHTS</div>
                    <div class="insight-data">
                        <div class="insights-container">
                            <div class="turns-called-container data">
                                <div class="turns-called-label">TURNS <br>CALLED</div>
                                <span class="turns-called-value">{{ store.stats.called }}</span>
                            </div>
                            <div class="turns-attended-container data">
                                <div class="turns-called-label">TURNS <br>ATTENDED</div>
                                <span class="turns-called-value">{{ store.stats.attended }}</span>
                            </div>
                            <div class="no-show-container data">
                                <div class="turns-called-label">NO <br>SHOW</div>
                                <span class="turns-called-value">{{ store.stats.skipped }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="history">
                    <div class="history-container">
                        <div class="title">HISTORY</div>
                        <div class="entries-container">
                            <div v-if="historyItems.length === 0" class="boh-history_empty">No history yet</div>
                            <div v-for="turn in historyItems" :key="turn.id + turn.status" class="boh-history_item entry">
                                <div class="status-and-code">
                                    <span class="status-icon" :class="statusMod(turn.status)">
                                        {{ statusLabel(turn.status) }}
                                    </span>
                                    <span class="code">{{ turn.id }}</span>
                                </div>
                                <div class="details">
                                    <div class="code">{{ turn.serviceLabel }}</div>
                                    <div class="code">—</div>
                                    <div class="code">4 min</div>
                                </div>
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
        box-sizing: border-box;
        width: 1440px;
        flex-direction: row;
        padding: 24px;
        gap: 480px;
        border-bottom: 2px solid white;
        background-color: #07101E;
    }

    .header-title {
        display: flex;
        flex-direction: row;
        gap: 32px;
        width: 716px;
        color: #EEF3FF;
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

    .system-name {
        color: #EEF3FF;
        opacity: 60%;
    }

    .header-username {
        font-family: "Figtree";
        font-weight: 600;
        font-size: 24px;
        color: #EEF3FF;
    }

    .logo-image {
        width: 72px;
        height: 72px;
    }

    .boh-content {
        display: flex;
        flex-direction: row;
    }

    .main-screen {
        width: 1160px;
        height: 813px;
        background-color: #EEF1F6;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 42px 0;
        gap: 32px;
    }

    .side-panel {
        width: 280px;
    }

    .info {
        width: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 40px;
        text-align: center;
        font-size: 24px;
        color: #000;
        font-family: 'figtree';
    }

    .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .counter-id {
        font-weight: 600;
    }

    .services {
        display: flex;
        align-items: center;
        gap: 16px;
        text-align: left;
        justify-content: center;
    }

    .time {
        font-family: 'Figtree';
        font-size: 48px;
        font-weight: 800;
        color: #8D8D8D;
    }

    .next-btn {
        width: 480px;
        height: 240px;
        border-radius: 8px;
        background-color: #1057cc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px;
        box-sizing: border-box;
        text-align: center;
        font-size: 32px;
        color: white;
        font-family: 'syne';
    }

    .container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;
    }

    .cta {
        text-transform: uppercase;
    }

    .btn-kbd {
        display: block;
        font: 500 12px 'figtree';
    }

    .status-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        font-size: 16px;
        font-family: 'figtree';
    }

    .next-details {
        display: flex;
        align-items: flex-start;
        gap: 4px;
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
        padding: 0 32px;
        gap: 32px;
    }

    .status-title {
        font-family: 'figtree';
        font-size: 32px;
        font-weight: 600;
        display: contents;
    }

    .turn {
        font-size: 96px;
        font-family: 'syne';
        color: #949494;
    }

    .summary-divider {
        width: 926px;
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
        padding: 0 32px;
        gap: 32px;
        font-size: 24px;
    }

    .name-info {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .name-value, .id-value {
        font: 400 20px 'figtree';
        color: #000;
    }

    .condition-value {
        font: 400 20px 'figtree';
        color: #92400E;
    }

    .called-time, .time-elapsed {
        font: 500 16px 'figtree';
        color: #000;
    }

    .timing-info {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 20px;
    }

    .called-info {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .called-value {
        font-size: 16px;
    }

    .actions {
        display: flex;
        align-items: center;
        color: #0E3FA3;
    }

    .end-turn-button {
        height: 48px;
        width: 500px;
        background-color: #20CB8B;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        box-sizing: border-box;
        color: #0E3FA3;
        font-weight: 500;
        font-family: 'figtree';
        font-size: 24px;
        gap: 16px;
    }

    .mark-no-show-button {
        height: 48px;
        width: 500px;
        border: 1px solid rgba(255, 255, 255, 0.17);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        color: #4B5563;
        font-weight: 500;
        font-family: 'figtree';
        font-size: 24px;
        gap: 16px;
    }

    .side-panel {
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .insights {
        background-color: #112035;
        height: 538px;
        width: auto;
        border-bottom: 2px solid #EEF3FF;
    }

    .insights {
        width: 100%;
        height: 538px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 32px;
        box-sizing: border-box;
        gap: 32px;
        text-align: center;
        font-size: 32px;
        color: #eef3ff;
        font-family: "figtree";
    }

    .insight-title {
        width: 100%;
        font-size: 32px;
        font-weight: 600;
        font-family: "figtree";
        color: #eef3ff;
        text-align: center;
        display: inline-block;
    }

    .insight-data {
        display: flex;
        gap: 12px;
        width: 100%;
    }

    .data {
        width: 100%;
        gap: 8px;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: flex-start;
    }

    .insights-container {
        display: flex;
        align-items: flex-start;
        gap: 48px;
        text-align: left;
        font-size: 24px;
        flex-direction: column;
        color: #20CB8B;
        width: 100%;
        box-sizing: border-box;
    }

    .turns-called-label {
        font-weight: 500;
    }

    .turns-called-value {
        font-size: 48px;
        font-family: 'syne';
        color: #EEF3FF;
    }

    .history {
        background-color: #0c1828;
        width: auto;
        height: 359px;
        box-sizing: border-box;
    }

    .history-container {
        width: 100%;
        height: 320px;
        position: relative;
        background-color: #0c1828;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px 16px;
        box-sizing: border-box;
        gap: 24px;
        text-align: center;
        font-size: 32px;
        color: #eef3ff;
        font-family: 'figtree';
    }

    .title {
        position: relative;
        font-weight: 600;
        flex-shrink: 0;
    }

    .entries-container {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        flex-shrink: 0;
        text-align: left;
        font-size: 12px;
    }

    .entry {
        border-radius: 4px;
        background-color: #000;
        display: flex;
        align-items: center;
        padding: 8px;
        gap: 32px;
    }

    .status-and-code {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .status-icon {
        height: 12px;
        width: 12px;
        border-radius: 48px;
        background-color: #3ddba4;
    }

    .details {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #EEF3FF;
        opacity: 60%;
    }

    .boh-badge {
        font-family: 'figtree';
        font-size: 12px; 
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 9999px;
        letter-spacing: 0.02em;
        white-space: nowrap;
    }

    .boh-call-btn--disabled {
        background: #4B5563;
        box-shadow: 0 8px 32px rgba(16, 38, 185, 0.25);
        cursor: default;
    }

    .boh-badge--sm { font-size: 8px; padding: 2px 7px; }
    .boh-badge--blue   { background-color: rgba(26, 114, 255, 0.17);   color: #0E3FA3; }
    .boh-badge--green  { background-color: rgba(32, 203, 139, 0.17);  color: #065F46; }
    .boh-badge--amber  { background-color: rgba(245, 158, 11, 0.17);  color: #92400E; }
    .boh-badge--gray   { background-color: rgba(238, 243, 255, 0.17); color: #949494; }

    .boh-priority-tag {
        font-size: 12px; 
        font-weight: 700;
        color: #FEF3C7;
        background-color: rgba(245,158,11,0.25);
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
    }


</style>