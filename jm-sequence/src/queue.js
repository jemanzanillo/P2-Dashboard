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

  const initialized   = ref(false)
  const loading       = ref(false)
  const error         = ref(null)
  const realtimeStatus = ref('IDLE')   // IDLE | SUBSCRIBED | RECONNECTING | CHANNEL_ERROR | TIMED_OUT | CLOSED

  let _channel = null   // { unsubscribe, forceReconnect, getStatus }
  let _onVisibilityChange = null
  let _onOnline           = null
  let _resyncInFlight     = false

  // ── Realtime handlers ──────────────────────────────────────────────────────

  function handleTurnoEvent({ eventType, new: newRow, old: oldRow }) {
    if (eventType === 'INSERT') {
      fetchSingleTurn(newRow.id).then(turn => {
        if (!turn) { resyncFromServer(); return }
        // Deduplicate: the DB trigger (fn_generate_turno_numero) fires an UPDATE
        // immediately after INSERT, and both async fetches may race. Only push if
        // the UPDATE handler hasn't already added this turn.
        if (!turns.value.some(t => t.dbId === newRow.id)) {
          turns.value.push(turn)
        }
      }).catch(() => resyncFromServer())
      return
    }

    if (eventType === 'UPDATE') {
      fetchSingleTurn(newRow.id).then(turn => {
        if (!turn) { resyncFromServer(); return }
        const idx = turns.value.findIndex(t => t.dbId === newRow.id)
        if (idx >= 0) {
          turns.value[idx] = turn
        } else {
          turns.value.push(turn)
        }

        // Keep counters[].currentTurnId in sync with turn state changes.
        // fetchCounters() only reflects 'llamado' turns at query time; without this
        // patch, the FOH carousel stays stale after a turn is finished/cancelled.
        if (turn.counterId) {
          const counter = counters.value.find(c => c.id === turn.counterId)
          if (counter) {
            counter.currentTurnId = turn.status === 'called' ? turn.dbId : null
          }
        }

        // Keep activeTurn in sync: clear it when the active turn is finished/deferred.
        if (activeTurn.value?.dbId === newRow.id) {
          if (['attended', 'skipped', 'cancelled', 'deferred'].includes(turn.status)) {
            activeTurn.value = null
          } else {
            activeTurn.value = { ...turn }
          }
        }

        // Agent: set activeTurn when any turn is called to their counter.
        // callNext() only updates the DB — it relies on this Realtime path to
        // populate activeTurn, which drives the turn-summary panel and action buttons.
        if (agentCounterId.value != null && turn.counterId === agentCounterId.value && turn.status === 'called') {
          activeTurn.value = { ...turn }
        }

        // FOH has no assigned counter (agentCounterId == null).
        // Track whichever turn was most recently called so the FOH panel stays populated.
        if (agentCounterId.value == null && turn.status === 'called') {
          activeTurn.value = { ...turn }
        }

        // Increment callSeq to trigger FOH chime + TTS announcements.
        // Agent stores: only for their counter. FOH store (no counter): for all counters.
        const firstCall = oldRow?.called_at == null && newRow?.called_at != null
        const isRecall  = newRow?.call_count > (oldRow?.call_count ?? 0) && oldRow?.called_at != null
        const counterMatches = agentCounterId.value == null || turn.counterId === agentCounterId.value
        if ((firstCall || isRecall) && counterMatches) {
          callSeq.value++
        }
      }).catch(() => resyncFromServer())
      return
    }

    if (eventType === 'DELETE') {
      turns.value = turns.value.filter(t => t.dbId !== oldRow.id)
      if (activeTurn.value?.dbId === oldRow.id) activeTurn.value = null
    }
  }

  // Atomic catch-up after Realtime reconnect / tab wake / online event.
  // Replaces turns + counters with fresh server state so missed events can't leave
  // the UI desynced. Idempotent: only one request in flight at a time.
  async function resyncFromServer() {
    if (_resyncInFlight) return
    _resyncInFlight = true
    try {
      const [freshTurns, freshCounters] = await Promise.all([fetchTurns(), fetchCounters()])
      turns.value    = freshTurns
      counters.value = freshCounters
      // Re-derive activeTurn for agents whose counter has a current call
      if (agentCounterId.value != null) {
        const myCounter = freshCounters.find(c => c.id === agentCounterId.value)
        activeTurn.value = myCounter?.currentTurnId
          ? freshTurns.find(t => t.dbId === myCounter.currentTurnId) ?? null
          : null
      }
    } catch (e) {
      console.warn('[queue] resyncFromServer failed:', e.message)
    } finally {
      _resyncInFlight = false
    }
  }

  function handleVentanillaEvent() {
    fetchCounters().then(data => { counters.value = data })
  }

  // ── Init / cleanup ─────────────────────────────────────────────────────────

  let _initPromise = null   // deduplicates concurrent init() calls

  async function init() {
    if (initialized.value) return
    // If an init is already in flight, wait for it instead of starting a second
    // one. A second concurrent init() would create an orphaned Realtime channel
    // that reconnects forever (the root cause of the SUBSCRIBED/CLOSED loop).
    if (_initPromise) return _initPromise
    let _resolve
    _initPromise = new Promise(r => { _resolve = r })
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

      _channel = subscribeToChanges({
        onTurnoChange:              handleTurnoEvent,
        onVentanillaChange:         handleVentanillaEvent,
        onVentanillaServicioChange: async () => { counters.value = await fetchCounters() },
        onStatusChange: (status) => { realtimeStatus.value = status },
        onResync:       () => { resyncFromServer() },
      })

      // Recover from idle / network blips: when the tab comes back to the foreground
      // or the network comes back online, force a Realtime reconnect and resync.
      _onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          _channel?.forceReconnect()
          resyncFromServer()
        }
      }
      _onOnline = () => {
        _channel?.forceReconnect()
        resyncFromServer()
      }
      document.addEventListener('visibilitychange', _onVisibilityChange)
      window.addEventListener('online', _onOnline)

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
      _initPromise = null
      _resolve?.()
    }
  }

  function cleanup() {
    if (_channel) { _channel.unsubscribe(); _channel = null }
    if (_onVisibilityChange) { document.removeEventListener('visibilitychange', _onVisibilityChange); _onVisibilityChange = null }
    if (_onOnline)           { window.removeEventListener('online', _onOnline); _onOnline = null }
    _initPromise = null   // allow a fresh init() after cleanup

    // Reset all derived state so a subsequent init() can't inherit a stale agentCounterId
    // (which would cause the Realtime handler to filter events for the wrong role).
    initialized.value    = false
    realtimeStatus.value = 'IDLE'
    agentCounterId.value = null
    activeTurn.value     = null
    turns.value          = []
    counters.value       = []
  }

  // Set the agent's assigned counter AND restore any in-progress turn for it.
  // Use this instead of writing agentCounterId directly — assigning the ref
  // bypasses the activeTurn restore, which left agents without their current
  // turn after a page refresh.
  function setCounter(id) {
    agentCounterId.value = id ?? null
    if (!id) { activeTurn.value = null; return }
    const myCounter = counters.value.find(c => c.id === id)
    if (myCounter?.currentTurnId) {
      activeTurn.value = turns.value.find(t => t.dbId === myCounter.currentTurnId) ?? null
    }
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

  const waitingTurns = computed(() => {
    // When an agent is logged in, only show turns for services their counter handles.
    // FOH/kiosk leave agentCounterId null and see the full queue.
    let svcFilter = null
    if (agentCounterId.value != null) {
      const counter = counters.value.find(c => c.id === agentCounterId.value)
      if (counter?.serviceIDs?.length) {
        const allowed = new Set(counter.serviceIDs)
        svcFilter = (t) => allowed.has(t.serviceID)
      }
    }
    return turns.value
      .filter(t => (t.status === 'waiting' || t.status === 'deferred') && (!svcFilter || svcFilter(t)))
      .sort((a, b) => {
        if (a.reinstated && !b.reinstated) return -1
        if (b.reinstated && !a.reinstated) return 1
        if (a.priority === 'special' && b.priority !== 'special') return -1
        if (b.priority === 'special' && a.priority !== 'special') return 1
        return new Date(a.createdAt) - new Date(b.createdAt)
      })
  })

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
    realtimeStatus,
    // actions
    init,
    cleanup,
    setCounter,
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
