import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  testConnection,
  fetchTurns,
  fetchCounters,
  fetchServices,
  fetchConditions,
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
  transferTurn  as dbTransferTurn,
  subscribeToChanges,
  clearCorruptedSession,
} from '@/lib/db.js'

export const useQueueStore = defineStore('queue', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const turns          = ref([])
  const activeTurn     = ref(null)
  const counters       = ref([])
  const services       = ref([])
  const conditions     = ref([])
  const callSeq        = ref(0)
  const agentCounterId = ref(null)

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
        if ((firstCall || isRecall) && agentCounterId.value != null && turn.counterId === agentCounterId.value) {
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

  function handleVentanillaEvent() {
    fetchCounters().then(data => { counters.value = data })
  }

  // ── Init / cleanup ─────────────────────────────────────────────────────────

  async function init() {
    if (initialized.value) return
    loading.value = true
    error.value   = null
    try {
      console.log('[queue] init: starting...')

      // Test connection first
      console.log('[queue] init: testing connection...')
      const connTest = await testConnection()
      console.log('[queue] init: connection test result:', connTest)

      if (!connTest.success) {
        throw new Error(`Connection test failed: ${connTest.error}`)
      }

      // Fetch each query separately with timeout to identify which one is hanging
      const timeoutMs = 10000 // 10s timeout per query
      const fetchWithTimeout = async (name, fn) => {
        try {
          console.log(`[queue] init: fetching ${name}...`)
          const result = await Promise.race([
            fn(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout fetching ${name} after ${timeoutMs}ms`)), timeoutMs)
            )
          ])
          console.log(`[queue] init: ${name} complete`)
          return result
        } catch (e) {
          console.error(`[queue] init: ${name} failed:`, e.message)
          throw e
        }
      }

      const turnsData = await fetchWithTimeout('turns', fetchTurns)
      const countersData = await fetchWithTimeout('counters', fetchCounters)
      const servicesData = await fetchWithTimeout('services', fetchServices)
      const conditionsData = await fetchWithTimeout('conditions', fetchConditions)
      console.log('[queue] init: fetched data', { turnsCount: turnsData?.length, servicesCount: servicesData?.length })
      turns.value      = turnsData
      counters.value   = countersData
      services.value   = servicesData
      conditions.value = conditionsData

      // Restore any in-progress turn for this agent's counter
      const myCounter = counters.value.find(c => c.id === agentCounterId.value)
      if (myCounter?.currentTurnId) {
        activeTurn.value = turns.value.find(t => t.dbId === myCounter.currentTurnId) ?? null
      }

      _unsubscribe = subscribeToChanges({
        onTurnoChange:               handleTurnoEvent,
        onVentanillaChange:          handleVentanillaEvent,
        onVentanillaServicioChange:  async () => { counters.value = await fetchCounters() },
      })
      initialized.value = true
    } catch (e) {
      error.value = e.message ?? 'Error al cargar los turnos'
      console.error('[queue] init error:', e)

      const isAuthError = e.name === 'UnauthorizedError' || e.statusCode === 401 ||
                         (e.message && e.message.includes('Unauthorized'))
      const isTimeout = e.message && e.message.includes('Timeout')

      if (isAuthError) {
        console.error('[queue] Authentication error — session is invalid')
        clearCorruptedSession()
        error.value = 'Tu sesión expiró. Por favor, inicia sesión nuevamente.'
        // Don't set initialized = true; let the view redirect to login
        initialized.value = false
      } else if (isTimeout) {
        console.warn('[queue] Query timeout detected — clearing potentially corrupted session')
        clearCorruptedSession()
        // Clear all auth-related localStorage keys as a safety measure
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth') || key.includes('sb-') || key.includes('supabase')) {
            console.warn('[queue] Clearing localStorage key:', key)
            localStorage.removeItem(key)
          }
        })
        error.value = 'Sesión expirada. Por favor, recarga la página e inicia sesión nuevamente.'
        initialized.value = true
      } else {
        initialized.value = true
      }

      turns.value = []
      counters.value = []
      services.value = []
      conditions.value = []
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

  async function transferTurn(newCounterId) {
    if (!activeTurn.value) return
    try {
      await dbTransferTurn({ dbId: activeTurn.value.dbId, newVentanillaId: newCounterId })
    } catch (e) {
      error.value = e.message
    }
  }

  async function createTurn(serviceId, patientName, idNumber, condicionIds = []) {
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
    services,
    conditions,
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
    transferTurn,
    createTurn,
    // getters
    waitingTurns,
    nextTurn,
    history,
    stats,
  }
})
