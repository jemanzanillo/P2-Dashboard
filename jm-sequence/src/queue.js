import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const SERVICES = [
    { id: 'A', label: 'Admission', prefix: 'A' },
    { id: 'C', label: 'Consultation', prefix: 'C' },
    { id: 'E', label: 'Emergency', prefix: 'E' },
    { id: 'L', label: 'Labs', prefix: 'L' },
    { id: 'P', label: 'Pharmacy', prefix: 'P' },
    { id: 'R', label: 'Rehabilitation', prefix: 'R' },
    { id: 'S', label: 'Specialty', prefix: 'S' },
    { id: 'X', label: 'X-ray', prefix: 'X' }
]

// 20 pre-generated turns ready for the agent/FOH demo.
// Status: 'waiting' | 'called' | 'attended' | 'skipped'
// Priority: 'normal' | 'special'
// Special Condition: 'Normal' | 'Pregnancy' | 'Elderly Age (65+)' | 'Disability'
const DEMO_TURNS = [
  { id: 'L001', serviceID: 'L', serviceLabel: 'Laboratory',    priority: 'special', status: 'waiting', createdAt: '2026-05-11T08:00:00.000Z', calledAt: null, patientName: 'María García López', idNumber: '001-2345678-1', specialCondition: 'Elderly Age (65+)' },
  { id: 'A001', serviceID: 'A', serviceLabel: 'Admission',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:01:00.000Z', calledAt: null, patientName: 'Juan Carlos Rodríguez', idNumber: '002-3456789-2', specialCondition: 'Normal' },
  { id: 'C001', serviceID: 'C', serviceLabel: 'Consultation',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:02:00.000Z', calledAt: null, patientName: 'Elena Martínez', idNumber: '003-4567890-3', specialCondition: 'Pregnancy' },
  { id: 'L002', serviceID: 'L', serviceLabel: 'Laboratory',    priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:03:00.000Z', calledAt: null, patientName: '', idNumber: '004-5678901-4', specialCondition: 'Normal' },
  { id: 'S001', serviceID: 'S', serviceLabel: 'Specialty',   priority: 'special', status: 'waiting', createdAt: '2026-05-11T08:04:00.000Z', calledAt: null, patientName: 'Roberto Díaz', idNumber: '005-6789012-5', specialCondition: 'Disability' },
  { id: 'X001', serviceID: 'X', serviceLabel: 'X-ray',        priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:05:00.000Z', calledAt: null, patientName: 'Sofía Cabrera', idNumber: '006-7890123-6', specialCondition: 'Normal' },
  { id: 'P001', serviceID: 'P', serviceLabel: 'Pharmacy',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:06:00.000Z', calledAt: null, patientName: 'Miguel Sánchez', idNumber: '', specialCondition: 'Normal' },
  { id: 'A002', serviceID: 'A', serviceLabel: 'Admission',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:07:00.000Z', calledAt: null, patientName: 'Laura Pérez', idNumber: '008-9012345-8', specialCondition: 'Elderly Age (65+)' },
  { id: 'R001', serviceID: 'R', serviceLabel: 'Rehabilitation', priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:08:00.000Z', calledAt: null, patientName: 'Carlos López', idNumber: '009-0123456-9', specialCondition: 'Disability' },
  { id: 'C002', serviceID: 'C', serviceLabel: 'Consultation',       priority: 'special', status: 'waiting', createdAt: '2026-05-11T08:09:00.000Z', calledAt: null, patientName: '', idNumber: '', specialCondition: 'Pregnancy' },
  { id: 'L003', serviceID: 'L', serviceLabel: 'Laboratory',    priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:10:00.000Z', calledAt: null, patientName: 'Adriana Reyes', idNumber: '011-2345678-1', specialCondition: 'Normal' },
  { id: 'S002', serviceID: 'S', serviceLabel: 'Specialty',   priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:11:00.000Z', calledAt: null, patientName: 'Fernando Moreno', idNumber: '012-3456789-2', specialCondition: 'Normal' },
  { id: 'X002', serviceID: 'X', serviceLabel: 'X-ray',        priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:12:00.000Z', calledAt: null, patientName: 'Gloria Méndez', idNumber: '013-4567890-3', specialCondition: 'Elderly Age (65+)' },
  { id: 'A003', serviceID: 'A', serviceLabel: 'Admission',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:13:00.000Z', calledAt: null, patientName: 'Antonio Núñez', idNumber: '014-5678901-4', specialCondition: 'Normal' },
  { id: 'P002', serviceID: 'P', serviceLabel: 'Pharmacy',       priority: 'special', status: 'waiting', createdAt: '2026-05-11T08:14:00.000Z', calledAt: null, patientName: 'Beatriz Silva', idNumber: '015-6789012-5', specialCondition: 'Disability' },
  { id: 'C003', serviceID: 'C', serviceLabel: 'Consultation',       priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:15:00.000Z', calledAt: null, patientName: 'Diego Herrera', idNumber: '016-7890123-6', specialCondition: 'Normal' },
  { id: 'R002', serviceID: 'R', serviceLabel: 'Rehabilitation', priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:16:00.000Z', calledAt: null, patientName: 'Catalina Vargas', idNumber: '017-8901234-7', specialCondition: 'Pregnancy' },
  { id: 'L004', serviceID: 'L', serviceLabel: 'Laboratory',    priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:17:00.000Z', calledAt: null, patientName: '', idNumber: '018-9012345-8', specialCondition: 'Normal' },
  { id: 'S003', serviceID: 'S', serviceLabel: 'Specialty',   priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:18:00.000Z', calledAt: null, patientName: 'Raúl Romero', idNumber: '019-0123456-9', specialCondition: 'Elderly Age (65+)' },
  { id: 'X003', serviceID: 'X', serviceLabel: 'X-ray',        priority: 'normal',  status: 'waiting', createdAt: '2026-05-11T08:19:00.000Z', calledAt: null, patientName: 'Valeria Cruz', idNumber: '020-1234567-0', specialCondition: 'Normal' },
]

// ─── DEMO COUNTER CONFIG ──────────────────────────────────────────────────────
// Maps counter ID → array of accepted serviceIDs (admin-assigned, inherited by agent)
const DEMO_COUNTERS = [
  { id: 1, label: 'Counter 1', serviceIDs: ['L', 'X'], status: 'active' },
  { id: 2, label: 'Counter 2', serviceIDs: ['A', 'C'], status: 'active' },
  { id: 3, label: 'Counter 3', serviceIDs: ['S', 'R'], status: 'active' },
  { id: 4, label: 'Counter 4', serviceIDs: ['P', 'E'], status: 'active' },
]

export const useQueueStore = defineStore('queue', () => {
    // State
  const turns    = ref(DEMO_TURNS.map(t => ({ ...t })))
  const activeTurn = ref(null)
  const counters = ref(DEMO_COUNTERS.map(c => ({ ...c, currentTurnId: null })))

  // Active agent's counter (demo: counter 1)
  const agentCounterId = ref(1)

    // Sync between tabs
    const channel = new BroadcastChannel('jm-sequence')
    channel.onmessage = (e) => {
        if (e.data.type === 'STATE_UPDATE') {
            turns.value = e.data.turns
            activeTurn.value = e.data.activeTurn
            counters.value = e.data.counters
        }
    }

    function broadcast() {
        const payload = {
        type:        'STATE_UPDATE',
        turns:       turns.value,
        activeTurn:  activeTurn.value,
        counters:    counters.value,
        }
        try { channel.postMessage(payload) } catch {}
        try { localStorage.setItem('jm-state', JSON.stringify(payload)) } catch {}
    }

    // load state at startup
    function loadFromStorage() {
        try {
        const saved = localStorage.getItem('jm-state')
        if (saved) {
            const s = JSON.parse(saved)
            turns.value      = s.turns      || DEMO_TURNS.map(t => ({ ...t }))
            activeTurn.value = s.activeTurn || null
            counters.value   = s.counters   || DEMO_COUNTERS.map(c => ({ ...c, currentTurnId: null }))
        }
        } catch {}
    }

    // ── Actions ────────────────────────────────────────────────────────────────
    
    /**
     * Call the next turn in queue.
     * The counter for the active agent is used; it accepts all services in this demo.
     * Priority (special > normal) then FIFO.
     */
    function callNext() {
        const next = turns.value
        .filter(t => t.status === 'waiting')
        .sort((a, b) => {
            if (a.priority === 'special' && b.priority !== 'special') return -1
            if (b.priority === 'special' && a.priority !== 'special') return 1
            return new Date(a.createdAt) - new Date(b.createdAt)
        })[0]
    
        if (!next) return null
    
        // Mark any previous active turn as attended first
        if (activeTurn.value) {
        const prev = turns.value.find(t => t.id === activeTurn.value.id)
        if (prev && prev.status === 'called') prev.status = 'attended'
        }
    
        next.status   = 'called'
        next.calledAt = new Date().toISOString()
        activeTurn.value = { ...next }
    
        // Update counter display
        const counter = counters.value.find(c => c.id === agentCounterId.value)
        if (counter) counter.currentTurnId = next.id
    
        broadcast()
        return next
    }
    
    /** Mark the active turn as attended and clear it */
    function finishTurn() {
        if (!activeTurn.value) return
        const t = turns.value.find(t => t.id === activeTurn.value.id)
        if (t) t.status = 'attended'
        activeTurn.value = null
        broadcast()
    }
    
    /** Mark the active turn as skipped (no-show) and clear it */
    function skipTurn() {
        if (!activeTurn.value) return
        const t = turns.value.find(t => t.id === activeTurn.value.id)
        if (t) t.status = 'skipped'
        activeTurn.value = null
        broadcast()
    }

    // ── Getters ───────────────────────────────────────────────────────────────
    
    const waitingTurns = computed(() =>
        turns.value
        .filter(t => t.status === 'waiting')
        .sort((a, b) => {
            if (a.priority === 'special' && b.priority !== 'special') return -1
            if (b.priority === 'special' && a.priority !== 'special') return 1
            return new Date(a.createdAt) - new Date(b.createdAt)
        })
    )
    
    const nextTurn = computed(() => waitingTurns.value[0] || null)

    const history = computed(() =>
        turns.value
        .filter(t => t.status !== 'waiting')
        .slice(-8)
        .reverse()
    )

    const stats = computed(() => ({
        waiting:  turns.value.filter(t => t.status === 'waiting').length,
        called:   turns.value.filter(t => ['called', 'attended', 'skipped'].includes(t.status)).length,
        attended: turns.value.filter(t => t.status === 'attended').length,
        skipped:  turns.value.filter(t => t.status === 'skipped').length,
    }))

    return {
        // state
        turns,
        activeTurn,
        counters,
        agentCounterId,
        // actions
        callNext,
        finishTurn,
        skipTurn,
        loadFromStorage,
        // getters
        waitingTurns,
        nextTurn,
        history,
        stats,
        // constants
        SERVICES,
    }
    })
