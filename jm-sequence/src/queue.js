import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchTurns,
  fetchCounters,
  fetchSingleTurn,
  mapTurnRow,
  insertTurn    as dbInsertTurn,
  callTurn      as dbCallTurn,
  recallTurn    as dbRecallTurn,
  finishTurn    as dbFinishTurn,
  markNoShow    as dbMarkNoShow,
  reinstateTurn as dbReinstateTurn,
  suspendTurn   as dbSuspendTurn,
  cancelTurn    as dbCancelTurn,
  subscribeToChanges,
} from '@/lib/db.js'

const SERVICES = [
    { id: 'admision',      label: 'Admisión',      labelEs: 'Admisión',      prefix: 'AD', color: '#1A72FF' },
    { id: 'citas',         label: 'Citas',          labelEs: 'Citas',          prefix: 'CI', color: '#06B6D4' },
    { id: 'consulta',      label: 'Consulta',       labelEs: 'Consulta',       prefix: 'CO', color: '#8B5CF6' },
    { id: 'cura',          label: 'Cura',           labelEs: 'Cura',           prefix: 'CU', color: '#20CB8B' },
    { id: 'especialidad',  label: 'Especialidad',   labelEs: 'Especialidad',   prefix: 'ES', color: '#EF4444' },
    { id: 'farmacia',      label: 'Farmacia',       labelEs: 'Farmacia',       prefix: 'FA', color: '#10B981' },
    { id: 'laboratorio',   label: 'Laboratorio',    labelEs: 'Laboratorio',    prefix: 'LA', color: '#F59E0B' },
    { id: 'rayosx',        label: 'Rayos X',        labelEs: 'Rayos X',        prefix: 'RX', color: '#EC4899' },
    { id: 'yeso',          label: 'Yeso',           labelEs: 'Yeso',           prefix: 'YE', color: '#F97316' },
]

export const useQueueStore = defineStore('queue', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const turns          = ref([])
  const activeTurn     = ref(null)
  const counters       = ref([])
  const callSeq        = ref(0)
  const agentCounterId = ref(1)

  const initialized = ref(false)
  const loading     = ref(false)
  const error       = ref(null)

  let _unsubscribe = null

  // ── Realtime handlers ──────────────────────────────────────────────────────

  function handleTurnoEvent({ eventType, new: newRow, old: oldRow }) {
    if (eventType === 'INSERT') {
      fetchSingleTurn(newRow.id).then(turn => {
        if (turn) turns.value.push(turn)
      })
      return
    }

    if (eventType === 'UPDATE') {
      fetchSingleTurn(newRow.id).then(turn => {
        if (!turn) return
        const idx = turns.value.findIndex(t => t.dbId === newRow.id)
        if (idx >= 0) {
          turns.value[idx] = turn
        } else {
          turns.value.push(turn)
        }

        // Keep activeTurn in sync
        if (activeTurn.value?.dbId === newRow.id) {
          if (['attended', 'skipped', 'cancelled', 'deferred'].includes(turn.status)) {
            activeTurn.value = null
          } else {
            activeTurn.value = { ...turn }
          }
        }

        // Increment callSeq so FOH announces — only on first call or recall
        const firstCall = oldRow?.called_at == null && newRow?.called_at != null
        const isRecall  = newRow?.call_count > (oldRow?.call_count ?? 0) && oldRow?.called_at != null
        if ((firstCall || isRecall) && turn.counterId === agentCounterId.value) {
          callSeq.value++
        }
      })
      return
    }

    if (eventType === 'DELETE') {
      turns.value = turns.value.filter(t => t.dbId !== oldRow.id)
      if (activeTurn.value?.dbId === oldRow.id) activeTurn.value = null
    }
  }

  function handleVentanillaEvent({ new: newRow }) {
    const idx = counters.value.findIndex(c => c.id === newRow.id)
    if (idx >= 0) {
      counters.value[idx].status = newRow.estado === 'activa' ? 'active' : 'inactive'
    }
  }

  // ── Init / cleanup ─────────────────────────────────────────────────────────

  async function init() {
    if (initialized.value) return
    loading.value = true
    error.value   = null
    try {
      const [turnsData, countersData] = await Promise.all([fetchTurns(), fetchCounters()])
      turns.value    = turnsData
      counters.value = countersData

      // Restore any in-progress turn for this agent's counter
      const myCounter = counters.value.find(c => c.id === agentCounterId.value)
      if (myCounter?.currentTurnId) {
        activeTurn.value = turns.value.find(t => t.dbId === myCounter.currentTurnId) ?? null
      }

      _unsubscribe = subscribeToChanges({
        onTurnoChange:      handleTurnoEvent,
        onVentanillaChange: handleVentanillaEvent,
      })
      initialized.value = true
    } catch (e) {
      error.value = e.message ?? 'Error al cargar los turnos'
      console.error('[queue] init error:', e)
    } finally {
      loading.value = false
    }
  }

  function cleanup() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function callNext() {
    if (activeTurn.value) return null
    const next = waitingTurns.value[0]
    if (!next) return null
    const calledAt = new Date().toISOString()
    try {
      await dbCallTurn({ dbId: next.dbId, ventanillaId: agentCounterId.value, calledAt })
    } catch (e) {
      error.value = e.message
      return null
    }
    return next
  }

  async function recallTurn() {
    if (!activeTurn.value) return
    const t = turns.value.find(t => t.dbId === activeTurn.value.dbId)
    if (!t) return
    const newCount = (t.callCount || 1) + 1
    const now      = new Date().toISOString()
    const newLog   = [...(t.callLog || []), { callNumber: newCount, timestamp: now }]
    try {
      await dbRecallTurn({ dbId: t.dbId, callCount: newCount, callLog: newLog })
    } catch (e) {
      error.value = e.message
    }
  }

  async function finishTurn() {
    if (!activeTurn.value) return
    const durationSeconds = activeTurn.value.calledAt
      ? Math.round((Date.now() - new Date(activeTurn.value.calledAt).getTime()) / 1000)
      : null
    try {
      await dbFinishTurn({ dbId: activeTurn.value.dbId, durationSeconds })
    } catch (e) {
      error.value = e.message
    }
  }

  async function markNoShow(override = false) {
    if (!activeTurn.value) return
    const durationSeconds = activeTurn.value.calledAt
      ? Math.round((Date.now() - new Date(activeTurn.value.calledAt).getTime()) / 1000)
      : null
    try {
      await dbMarkNoShow({ dbId: activeTurn.value.dbId, override, durationSeconds })
    } catch (e) {
      error.value = e.message
    }
  }

  async function reinstateFromHistory(turnId) {
    const t = turns.value.find(t => t.id === turnId)
    if (!t) return
    try {
      await dbReinstateTurn({ dbId: t.dbId })
    } catch (e) {
      error.value = e.message
    }
  }

  async function suspendTurn() {
    if (!activeTurn.value) return
    try {
      await dbSuspendTurn({ dbId: activeTurn.value.dbId })
    } catch (e) {
      error.value = e.message
    }
  }

  async function cancelTurn(turnId) {
    const t = turns.value.find(t => t.id === turnId)
    if (!t) return
    try {
      await dbCancelTurn({ dbId: t.dbId })
    } catch (e) {
      error.value = e.message
    }
  }

  async function createTurn(serviceId, patientName, idNumber, specialCondition) {
    const condicionIds = []
    try {
      const result = await dbInsertTurn({ serviceId, patientName, idNumber, condicionIds })
      return { id: result.numero, dbId: result.id }
    } catch (e) {
      error.value = e.message
      return null
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  const waitingTurns = computed(() =>
    turns.value
      .filter(t => t.status === 'waiting' || t.status === 'deferred')
      .sort((a, b) => {
        if (a.reinstated && !b.reinstated) return -1
        if (b.reinstated && !a.reinstated) return 1
        if (a.priority === 'special' && b.priority !== 'special') return -1
        if (b.priority === 'special' && a.priority !== 'special') return 1
        return new Date(a.createdAt) - new Date(b.createdAt)
      })
  )

  const nextTurn = computed(() => waitingTurns.value[0] || null)

  const history = computed(() =>
    turns.value
      .filter(t => (t.status === 'attended' || t.status === 'skipped') && t.calledAt != null)
      .slice()
      .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))
  )

  const stats = computed(() => ({
    waiting:  turns.value.filter(t => t.status === 'waiting' || t.status === 'deferred').length,
    called:   turns.value.filter(t =>
      ['called', 'attended', 'skipped'].includes(t.status) || t.noShowOccurred === true
    ).length,
    attended: turns.value.filter(t => t.status === 'attended').length,
    skipped:  turns.value.filter(t => t.noShowOccurred === true).length,
  }))

  return {
    // state
    turns,
    activeTurn,
    counters,
    agentCounterId,
    callSeq,
    initialized,
    loading,
    error,
    // actions
    init,
    cleanup,
    callNext,
    recallTurn,
    finishTurn,
    markNoShow,
    reinstateFromHistory,
    suspendTurn,
    cancelTurn,
    createTurn,
    // getters
    waitingTurns,
    nextTurn,
    history,
    stats,
    // constants
    SERVICES,
  }
})
