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
  const agentCounterId = ref(null)

  const initialized   = ref(false)
  const loading       = ref(false)
  const error         = ref(null)
  const realtimeStatus = ref('IDLE')   // IDLE | SUBSCRIBED | RECONNECTING | CHANNEL_ERROR | TIMED_OUT | CLOSED

  let _channel = null   // { unsubscribe, forceReconnect, getStatus }
  let _onVisibilityChange = null
  let _onOnline           = null
  let _resyncInFlight     = false
  let _mutationsInFlight  = 0   // Block resync while any action is awaiting the DB

  // Direct event emitter for FOH audio announcements. Using Vue watchers on a
  // counter caused two rapid simultaneous calls (two agents) to be deduped into
  // one watcher flush, silencing the first announcement. Emitting directly from
  // the Realtime callback fires synchronously inside each microtask, before Vue
  // can batch them.
  let _announceListeners = []
  function onAnnounce(fn) {
    _announceListeners.push(fn)
    return () => { _announceListeners = _announceListeners.filter(f => f !== fn) }
  }
  function _emitAnnounce(turn, isRecall) {
    _announceListeners.forEach(fn => fn(turn, isRecall))
  }

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
        // Guard: only clear currentTurnId if THIS turn is still the counter's
        // current turn. A late no-show / finish event must not overwrite a newer
        // call that already replaced it (race: agent calls next turn before the
        // previous turn's noshow UPDATE propagates from the DB).
        if (turn.counterId) {
          const counter = counters.value.find(c => c.id === turn.counterId)
          if (counter) {
            if (turn.status === 'called') {
              counter.currentTurnId = turn.dbId
            } else if (counter.currentTurnId === turn.dbId) {
              counter.currentTurnId = null
            }
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

        // Emit FOH audio announcement directly — bypasses Vue's watcher scheduler
        // so two simultaneous calls from different agents both fire their chimes.
        const firstCall = oldRow?.called_at == null && newRow?.called_at != null
        const isRecall  = newRow?.call_count > (oldRow?.call_count ?? 0) && oldRow?.called_at != null
        const counterMatches = agentCounterId.value == null || turn.counterId === agentCounterId.value
        if ((firstCall || isRecall) && counterMatches) {
          _emitAnnounce(turn, isRecall)
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
    // Never overwrite state while an action is awaiting the DB — the optimistic
    // patch is intentional and the Realtime UPDATE will reconcile when it arrives
    if (_mutationsInFlight > 0) return
    _resyncInFlight = true
    const prevActive = activeTurn.value ? { ...activeTurn.value } : null
    try {
      const [freshTurns, freshCounters] = await Promise.all([fetchTurns(), fetchCounters()])
      turns.value    = freshTurns
      counters.value = freshCounters
      // Re-derive activeTurn: agents use their counter's current turn,
      // FOH (no counter) shows whichever turn was most recently called.
      let newActive = null
      if (agentCounterId.value != null) {
        const myCounter = freshCounters.find(c => c.id === agentCounterId.value)
        newActive = myCounter?.currentTurnId
          ? freshTurns.find(t => t.dbId === myCounter.currentTurnId) ?? null
          : null
      } else {
        const calledTurns = freshTurns
          .filter(t => t.status === 'called')
          .sort((a, b) =>
            new Date(b.lastCalledAt || b.calledAt || 0) -
            new Date(a.lastCalledAt || a.calledAt || 0))
        newActive = calledTurns[0] ?? null
      }
      activeTurn.value = newActive
      // Trigger announcement on FOH if resync uncovers a call the user missed
      // (e.g., Realtime was throttled while the tab was backgrounded). Compares
      // against the previous activeTurn to avoid double-firing announcements
      // that already played via the normal Realtime UPDATE path.
      if (agentCounterId.value == null && newActive) {
        const isNewTurn   = !prevActive || prevActive.dbId !== newActive.dbId
        const isNewRecall = prevActive?.dbId === newActive.dbId &&
                            (newActive.callCount ?? 0) > (prevActive.callCount ?? 0)
        if (isNewTurn || isNewRecall) _emitAnnounce(newActive, isNewRecall)
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
    // Allow re-init if Realtime has gone down (not just any time initialized=true)
    const realtimeIsDead = initialized.value && realtimeStatus.value === 'CLOSED'
    if (initialized.value && !realtimeIsDead) return
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

      // Restore any in-progress turn: agents see their counter's current call,
      // FOH (no counter) shows whichever turn was most recently called system-wide.
      if (agentCounterId.value != null) {
        const myCounter = counters.value.find(c => c.id === agentCounterId.value)
        if (myCounter?.currentTurnId) {
          activeTurn.value = turns.value.find(t => t.dbId === myCounter.currentTurnId) ?? null
        }
      } else {
        const calledTurns = turns.value
          .filter(t => t.status === 'called')
          .sort((a, b) =>
            new Date(b.lastCalledAt || b.calledAt || 0) -
            new Date(a.lastCalledAt || a.calledAt || 0))
        activeTurn.value = calledTurns[0] ?? null
      }

      // Clean up old channel if reinitializing (e.g., after Realtime dropped)
      if (_channel) {
        _channel.unsubscribe()
        _channel = null
      }

      _channel = subscribeToChanges({
        onTurnoChange:              handleTurnoEvent,
        onVentanillaChange:         handleVentanillaEvent,
        onVentanillaServicioChange: async () => { counters.value = await fetchCounters() },
        onStatusChange: (status) => { realtimeStatus.value = status },
        onResync:       () => { resyncFromServer() },
      })

      // Recover from idle / network blips: when the tab comes back to the foreground
      // or the network comes back online, reconcile state. Only force a Realtime
      // reconnect if the channel is actually unhealthy — forcing it while
      // SUBSCRIBED causes a CLOSED→SUBSCRIBED loop on every tab switch.
      _onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return
        if (realtimeStatus.value !== 'SUBSCRIBED') {
          _channel?.forceReconnect()
        }
        resyncFromServer()
      }
      _onOnline = () => {
        if (realtimeStatus.value !== 'SUBSCRIBED') {
          _channel?.forceReconnect()
        }
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
    // Always reset activeTurn — prevents stale FOH-branch value (set during init()
    // when agentCounterId was still null) from leaking into a counter with no active turn.
    activeTurn.value = myCounter?.currentTurnId
      ? turns.value.find(t => t.dbId === myCounter.currentTurnId) ?? null
      : null
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  //
  // All mutating actions follow the OPTIMISTIC pattern:
  //   1. Snapshot the current local state (so we can roll back on failure).
  //   2. Mutate local state immediately — UI updates in <100ms.
  //   3. await the DB call.
  //   4. If it throws: restore the snapshot and surface the error.
  //   5. The eventual Realtime postgres_changes event is idempotent — it
  //      replaces our optimistic patch with the canonical fetchSingleTurn row.
  //
  // Why: Realtime can lag or drop events (browser throttles WebSocket on
  // background tabs, weak Wi-Fi, reconnect races). Without optimistic updates
  // the agent click looked dead until a page refresh. See memory note
  // `queue_realtime_flow.md`.

  function snapshotTurn(dbId) {
    const idx = turns.value.findIndex(t => t.dbId === dbId)
    return {
      activeTurn: activeTurn.value ? { ...activeTurn.value } : null,
      turnIdx:    idx,
      turnRow:    idx >= 0 ? { ...turns.value[idx] } : null,
      counters:   counters.value.map(c => ({ id: c.id, currentTurnId: c.currentTurnId })),
    }
  }

  function restoreSnapshot(snap) {
    activeTurn.value = snap.activeTurn
    if (snap.turnIdx >= 0 && snap.turnRow) turns.value[snap.turnIdx] = snap.turnRow
    for (const c of snap.counters) {
      const live = counters.value.find(x => x.id === c.id)
      if (live) live.currentTurnId = c.currentTurnId
    }
  }

  function patchTurn(dbId, patch) {
    const idx = turns.value.findIndex(t => t.dbId === dbId)
    if (idx >= 0) turns.value[idx] = { ...turns.value[idx], ...patch }
  }

  function setCounterCurrent(counterId, dbId) {
    if (counterId == null) return
    const c = counters.value.find(x => x.id === counterId)
    if (c) c.currentTurnId = dbId
  }

  // After a mutation rejects, decide whether to roll back. On timeout the DB
  // request may have actually succeeded (common when the agent's tab was
  // backgrounded and the browser throttled the network), so we verify the
  // canonical row from the server before deciding. Non-timeout errors are
  // treated as real failures and always roll back.
  async function reconcileAfterMutationError(dbId, snap, e) {
    const isTimeout = e?.message?.includes('timeout')
    if (!isTimeout) {
      restoreSnapshot(snap)
      error.value = e.message
      return
    }
    // Timeout: the DB may or may not have applied the write. Fetch the canonical
    // row and compare against what we expected. If the DB state matches what we
    // optimistically applied, keep it; if the DB still shows the pre-mutation
    // state (write didn't go through), roll back so the agent isn't stuck.
    try {
      const fresh = await fetchSingleTurn(dbId)
      if (!fresh) { restoreSnapshot(snap); return }

      // If the DB row status still matches the snapshot (pre-mutation state),
      // the write failed — restore so the agent can retry cleanly.
      const dbMatchesPreMutation = fresh.status === snap.turnRow?.status
      if (dbMatchesPreMutation) {
        restoreSnapshot(snap)
        return
      }

      const idx = turns.value.findIndex(t => t.dbId === dbId)
      if (idx >= 0) turns.value[idx] = fresh
      if (activeTurn.value?.dbId === dbId) activeTurn.value = { ...fresh }
    } catch {
      restoreSnapshot(snap)
    }
  }

  async function callNext() {
    if (activeTurn.value) return null
    const next = waitingTurns.value[0]
    if (!next) return null
    const calledAt = new Date().toISOString()
    const snap = snapshotTurn(next.dbId)
    const optimistic = {
      ...next,
      status:       'called',
      counterId:    agentCounterId.value,
      calledAt,
      callCount:    1,
      callLog:      [{ callNumber: 1, timestamp: calledAt }],
      lastCalledAt: calledAt,
    }
    activeTurn.value = optimistic
    patchTurn(next.dbId, optimistic)
    setCounterCurrent(agentCounterId.value, next.dbId)
    // Announcement is emitted via _emitAnnounce in handleTurnoEvent when the
    // Realtime UPDATE confirms the call. Emitting it here would double-chime.
    _mutationsInFlight++
    try {
      await dbCallTurn({ dbId: next.dbId, ventanillaId: agentCounterId.value, calledAt })
    } catch (e) {
      await reconcileAfterMutationError(next.dbId, snap, e)
      return null
    } finally {
      _mutationsInFlight--
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
    const snap = snapshotTurn(t.dbId)
    const patch = { callCount: newCount, callLog: newLog, lastCalledAt: now }
    patchTurn(t.dbId, patch)
    activeTurn.value = { ...activeTurn.value, ...patch }
    // Announcement emitted by Realtime UPDATE — see callNext() note.
    _mutationsInFlight++
    try {
      await dbRecallTurn({ dbId: t.dbId, callCount: newCount, callLog: newLog })
    } catch (e) {
      await reconcileAfterMutationError(t.dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function finishTurn() {
    if (!activeTurn.value) return
    const durationSeconds = activeTurn.value.calledAt
      ? Math.round((Date.now() - new Date(activeTurn.value.calledAt).getTime()) / 1000)
      : null
    const dbId = activeTurn.value.dbId
    const snap = snapshotTurn(dbId)
    patchTurn(dbId, { status: 'attended', durationMs: durationSeconds != null ? durationSeconds * 1000 : null })
    activeTurn.value = null
    setCounterCurrent(agentCounterId.value, null)
    _mutationsInFlight++
    try {
      await dbFinishTurn({ dbId, durationSeconds })
    } catch (e) {
      await reconcileAfterMutationError(dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function markNoShow(override = false) {
    if (!activeTurn.value) return
    const durationSeconds = activeTurn.value.calledAt
      ? Math.round((Date.now() - new Date(activeTurn.value.calledAt).getTime()) / 1000)
      : null
    const dbId = activeTurn.value.dbId
    const snap = snapshotTurn(dbId)
    patchTurn(dbId, { status: 'skipped', noShowOccurred: true, noShowOverride: override })
    activeTurn.value = null
    setCounterCurrent(agentCounterId.value, null)
    _mutationsInFlight++
    try {
      await dbMarkNoShow({ dbId, override, durationSeconds })
    } catch (e) {
      await reconcileAfterMutationError(dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function reinstateFromHistory(turnId) {
    const t = turns.value.find(t => t.id === turnId)
    if (!t) return
    const snap = snapshotTurn(t.dbId)
    patchTurn(t.dbId, {
      status:         'deferred',
      reinstated:     true,
      calledAt:       null,
      callCount:      0,
      callLog:        [],
      noShowOverride: false,
      counterId:      null,
    })
    _mutationsInFlight++
    try {
      await dbReinstateTurn({ dbId: t.dbId })
    } catch (e) {
      await reconcileAfterMutationError(t.dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function suspendTurn() {
    if (!activeTurn.value) return
    const dbId = activeTurn.value.dbId
    const snap = snapshotTurn(dbId)
    patchTurn(dbId, { status: 'deferred' })
    activeTurn.value = null
    setCounterCurrent(agentCounterId.value, null)
    _mutationsInFlight++
    try {
      await dbSuspendTurn({ dbId })
    } catch (e) {
      await reconcileAfterMutationError(dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function cancelTurn(turnId) {
    const t = turns.value.find(t => t.id === turnId)
    if (!t) return
    const snap = snapshotTurn(t.dbId)
    patchTurn(t.dbId, { status: 'cancelled' })
    if (activeTurn.value?.dbId === t.dbId) {
      activeTurn.value = null
      setCounterCurrent(agentCounterId.value, null)
    }
    _mutationsInFlight++
    try {
      await dbCancelTurn({ dbId: t.dbId })
    } catch (e) {
      await reconcileAfterMutationError(t.dbId, snap, e)
    } finally {
      _mutationsInFlight--
    }
  }

  async function transferTurn(newCounterId) {
    if (!activeTurn.value) return
    const dbId = activeTurn.value.dbId
    const snap = snapshotTurn(dbId)
    patchTurn(dbId, {
      counterId:  newCounterId,
      status:     'deferred',
      reinstated: true,
      calledAt:   null,
      callCount:  0,
    })
    // Move currentTurnId from our counter to the new one
    setCounterCurrent(agentCounterId.value, null)
    setCounterCurrent(newCounterId, dbId)
    activeTurn.value = null
    _mutationsInFlight++
    try {
      await dbTransferTurn({ dbId, newVentanillaId: newCounterId })
    } catch (e) {
      await reconcileAfterMutationError(dbId, snap, e)
    } finally {
      _mutationsInFlight--
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
    initialized,
    loading,
    error,
    realtimeStatus,
    // actions
    onAnnounce,
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
