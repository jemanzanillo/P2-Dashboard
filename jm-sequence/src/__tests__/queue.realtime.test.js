// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { makeTurn, makeCounter, flush } from './helpers.js'

vi.mock('@/lib/db.js', () => ({
  testConnection: vi.fn(), fetchTurns: vi.fn(), fetchCounters: vi.fn(),
  fetchServices: vi.fn(), fetchConditions: vi.fn(), fetchSingleTurn: vi.fn(),
  mapTurnRow: vi.fn(), insertTurn: vi.fn(), callTurn: vi.fn(), recallTurn: vi.fn(),
  finishTurn: vi.fn(), markNoShow: vi.fn(), reinstateTurn: vi.fn(),
  suspendTurn: vi.fn(), cancelTurn: vi.fn(), transferTurn: vi.fn(),
  subscribeToChanges: vi.fn(), clearCorruptedSession: vi.fn(),
}))

import * as db from '@/lib/db.js'
import { useQueueStore } from '@/queue.js'

describe('handleTurnoEvent — Realtime reconciliation', () => {
  let store
  let handlers   // the callbacks the store registered with subscribeToChanges

  beforeEach(async () => {
    vi.clearAllMocks()
    db.testConnection.mockResolvedValue({ success: true })
    db.fetchTurns.mockResolvedValue([])
    db.fetchCounters.mockResolvedValue([])
    db.fetchServices.mockResolvedValue([])
    db.fetchConditions.mockResolvedValue([])
    db.subscribeToChanges.mockImplementation((h) => {
      handlers = h
      return { unsubscribe: vi.fn(), forceReconnect: vi.fn(), getStatus: vi.fn() }
    })

    setActivePinia(createPinia())
    store = useQueueStore()
    await store.init()
  })

  it('INSERT deduplicates on dbId (turn-appeared-twice regression)', async () => {
    db.fetchSingleTurn.mockImplementation((id) => Promise.resolve(makeTurn({ dbId: id })))
    store.turns = [makeTurn({ dbId: 'u1' })]

    handlers.onTurnoChange({ eventType: 'INSERT', new: { id: 'u1' } })
    await flush()
    expect(store.turns).toHaveLength(1)   // not duplicated

    handlers.onTurnoChange({ eventType: 'INSERT', new: { id: 'u2' } })
    await flush()
    expect(store.turns).toHaveLength(2)   // genuinely new turn added
  })

  it('UPDATE does not clear currentTurnId when a newer call already replaced it', async () => {
    store.counters = [makeCounter({ id: 5, currentTurnId: 'newer' })]
    db.fetchSingleTurn.mockResolvedValue(
      makeTurn({ dbId: 'older', status: 'skipped', counterId: 5 })
    )

    handlers.onTurnoChange({
      eventType: 'UPDATE',
      new: { id: 'older', call_count: 0 },
      old: { called_at: '2026-05-29T10:00:00Z', call_count: 0 },
    })
    await flush()

    expect(store.counters[0].currentTurnId).toBe('newer')
  })

  it('UPDATE sets the counter currentTurnId when a turn is called', async () => {
    store.counters = [makeCounter({ id: 5, currentTurnId: null })]
    db.fetchSingleTurn.mockResolvedValue(
      makeTurn({ dbId: 't9', status: 'called', counterId: 5, calledAt: '2026-05-29T10:00:00Z' })
    )

    handlers.onTurnoChange({
      eventType: 'UPDATE',
      new: { id: 't9', called_at: '2026-05-29T10:00:00Z', call_count: 1 },
      old: { called_at: null, call_count: 0 },
    })
    await flush()

    expect(store.counters[0].currentTurnId).toBe('t9')
  })

  it('UPDATE clears activeTurn when it is finished', async () => {
    store.activeTurn = makeTurn({ dbId: 'a1', status: 'called' })
    db.fetchSingleTurn.mockResolvedValue(makeTurn({ dbId: 'a1', status: 'attended' }))

    handlers.onTurnoChange({ eventType: 'UPDATE', new: { id: 'a1' }, old: {} })
    await flush()

    expect(store.activeTurn).toBeNull()
  })

  it('emits a FOH announcement on first call (counter matches in FOH mode)', async () => {
    const spy = vi.fn()
    store.onAnnounce(spy)
    db.fetchSingleTurn.mockResolvedValue(
      makeTurn({ dbId: 'c1', status: 'called', counterId: 5, calledAt: '2026-05-29T10:00:00Z' })
    )

    handlers.onTurnoChange({
      eventType: 'UPDATE',
      new: { id: 'c1', called_at: '2026-05-29T10:00:00Z', call_count: 1 },
      old: { called_at: null, call_count: 0 },
    })
    await flush()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toBe(false)   // isRecall === false
  })
})

describe('init / cleanup', () => {
  let store
  beforeEach(() => {
    vi.clearAllMocks()
    db.subscribeToChanges.mockImplementation(() => ({
      unsubscribe: vi.fn(), forceReconnect: vi.fn(), getStatus: vi.fn(),
    }))
    setActivePinia(createPinia())
    store = useQueueStore()
  })

  it('surfaces a connection failure without hanging', async () => {
    db.testConnection.mockResolvedValue({ success: false, error: 'offline' })

    await store.init()

    expect(store.error).toBeTruthy()
    expect(store.initialized).toBe(true)
    expect(store.turns).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('cleanup unsubscribes and resets derived state', async () => {
    db.testConnection.mockResolvedValue({ success: true })
    db.fetchTurns.mockResolvedValue([])
    db.fetchCounters.mockResolvedValue([])
    db.fetchServices.mockResolvedValue([])
    db.fetchConditions.mockResolvedValue([])
    await store.init()
    store.agentCounterId = 4
    store.activeTurn = makeTurn({ status: 'called' })

    store.cleanup()

    expect(store.initialized).toBe(false)
    expect(store.realtimeStatus).toBe('IDLE')
    expect(store.agentCounterId).toBeNull()
    expect(store.activeTurn).toBeNull()
    expect(store.turns).toEqual([])
  })
})
