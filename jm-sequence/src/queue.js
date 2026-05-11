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

export const useQueueStore = defineStore('queue', () => {
    // State
    const turns = ref([]) // every turn of the day
    const activeTurn = ref(null) // turn called
    const counters = ref({}) //

    // Sync between tabs
    const channel = new BroadcastChannel('JM-Sequence')
    channel.onmessage = (e) => {
        if (e.data.type === 'STATE_UPDATE') {
            turns.value = e.data.turns
            activeTurn.value = e.data.activeTurn
            counters.value = e.data.counters
        }
    }

    function broadcast() {
        channel.postMessage({
            type: 'STATE_UPDATE',
            turns: turns.value,
            activeTurn: activeTurn.value,
            counters: counters.value
        })
        // local storage as a backup
        localStorage.setItem('jm-state', JSON.stringify({
            turns: turns.value,
            activeTurn: activeTurn.value,
            counters: counters.value,
        })) 
    }

    // load state at startup
    function loadFromStorage() {
        const saved = localStorage.getItem('jm-state')
        if (saved) {
            const s = JSON.parse(saved)
            turns.value = s.turns || []
            activeTurn.value = s.activeTurn || null
            counters.value = s.counters || {}
        }
    }

    // Actions
    function generateTurn(serviceID, priority = 'normal') {
        const service = SERVICES.find(s => s.id === serviceID)
        counters.value[serviceID] = (counters.value[serviceID] || 0) + 1
        const number = String(counters.value[serviceID]).padStart(3, '0')
        const turn = {
            id: `${service.prefix}${number}`,
            serviceID,
            serviceLabel: service.label,
            priority,
            status: 'waiting', // other statuses: waiting, called, attended, skipped
            createdAt: new Date().toISOString(),
            calledAt: null,
        }
        turns.value.push(turn)
        broadcast()
        return turn
    }

    function callNext() {
        // Priority first
        const next = turns.value
        .filter(t => t.status === 'waiting')
        .sort((a, b) => {
            if (a.priority === 'special' && b.priority !== 'special') return -1
            if (b.priority === 'special' && a.priority !== 'special') return 1
            return new Date(a.createdAt) - new Date(b.createdAt)
        })[0]
        if (!next) return null
        next.status = 'called'
        next.calledAt = new Date().toISOString()
        activeTurn.value = next
        broadcast()
        return next
    }

    function finishTurn(status = 'attended') {
        if (!activeTurn.value) return
        const t = turns.value.find(t => t.id === activeTurn.value.id)
        if (t) t.status = status // attended or skipped
        activeTurn.value = null
        broadcast()
    }

    // Getters
    const waitingTurns = computed(() => 
        turns.value.filter(t => t.status === 'waiting')
        .sort((a,b) => {
            if (a.priority === 'special' && b.priority !== 'special') return -1
            if (b.priority === 'special' && a.priority !== 'special') return 1
            return new Date(a.createdAt) - new Date(b.createdAt)
        })
    )

    const history = computed(() =>
        turns.value.filter(t => t.status !== 'waiting').slice(-8).reverse()    
    )
    const stats = computed(() => ({
        waiting: turns.value.filter(t => t.status === 'waiting').length,
        called: turns.value.filter(t => ['called', 'attended'].includes(t.status)).length,
        attended: turns.value.filter(t => t.status === 'attended').length,
        skipped: turns.value.filter(t => t.status === 'skipped').length,
    }))

    return {
        turns, activeTurn, waiting, history, stats, generateTurn, callNext, finishTurn, loadFromStorage, SERVICES
    }

})
