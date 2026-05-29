import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { makeTurn, makeCounter } from './helpers.js'

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

describe('queue actions — optimistic state transitions', () => {
  let store
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    store = useQueueStore()
    // All DB mutations succeed by default.
    for (const fn of ['callTurn', 'recallTurn', 'finishTurn', 'markNoShow',
      'reinstateTurn', 'suspendTurn', 'cancelTurn', 'transferTurn']) {
      db[fn].mockResolvedValue({})
    }
  })

  it('callNext optimistically marks the next turn called and owns it', async () => {
    const next = makeTurn({ status: 'waiting' })
    store.turns = [next]
    store.agentCounterId = 3

    const returned = await store.callNext()

    expect(returned.dbId).toBe(next.dbId)
    expect(store.activeTurn.status).toBe('called')
    expect(store.activeTurn.counterId).toBe(3)
    expect(store.activeTurn.callCount).toBe(1)
    expect(store.turns[0].status).toBe('called')
    expect(db.callTurn).toHaveBeenCalledWith(
      expect.objectContaining({ dbId: next.dbId, ventanillaId: 3 })
    )
  })

  it('callNext returns null when a turn is already active', async () => {
    store.activeTurn = makeTurn({ status: 'called' })
    store.turns = [makeTurn({ status: 'waiting' })]
    expect(await store.callNext()).toBeNull()
    expect(db.callTurn).not.toHaveBeenCalled()
  })

  it('callNext returns null when the queue is empty', async () => {
    store.turns = []
    store.agentCounterId = 1
    expect(await store.callNext()).toBeNull()
  })

  it('finishTurn marks attended and clears the active turn', async () => {
    const t = makeTurn({ status: 'called', calledAt: new Date().toISOString(), counterId: 1 })
    store.turns = [t]
    store.activeTurn = { ...t }
    store.agentCounterId = 1
    store.counters = [makeCounter({ id: 1, currentTurnId: t.dbId })]

    await store.finishTurn()

    expect(store.turns[0].status).toBe('attended')
    expect(store.activeTurn).toBeNull()
    expect(store.counters[0].currentTurnId).toBeNull()
  })

  it('markNoShow marks skipped and flags noShowOccurred', async () => {
    const t = makeTurn({ status: 'called', calledAt: new Date().toISOString() })
    store.turns = [t]
    store.activeTurn = { ...t }

    await store.markNoShow(true)

    expect(store.turns[0].status).toBe('skipped')
    expect(store.turns[0].noShowOccurred).toBe(true)
    expect(store.turns[0].noShowOverride).toBe(true)
    expect(store.activeTurn).toBeNull()
  })

  it('suspendTurn defers the active turn', async () => {
    const t = makeTurn({ status: 'called' })
    store.turns = [t]
    store.activeTurn = { ...t }
    await store.suspendTurn()
    expect(store.turns[0].status).toBe('deferred')
    expect(store.activeTurn).toBeNull()
  })

  it('transferTurn moves currentTurnId to the new counter', async () => {
    const t = makeTurn({ status: 'called', counterId: 1 })
    store.turns = [t]
    store.activeTurn = { ...t }
    store.agentCounterId = 1
    store.counters = [
      makeCounter({ id: 1, currentTurnId: t.dbId }),
      makeCounter({ id: 2, currentTurnId: null }),
    ]

    await store.transferTurn(2)

    expect(store.turns[0].counterId).toBe(2)
    expect(store.turns[0].status).toBe('deferred')
    expect(store.activeTurn).toBeNull()
    expect(store.counters.find(c => c.id === 1).currentTurnId).toBeNull()
    expect(store.counters.find(c => c.id === 2).currentTurnId).toBe(t.dbId)
  })
})

describe('queue actions — recall / reinstate / cancel / create', () => {
  let store
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    store = useQueueStore()
    for (const fn of ['recallTurn', 'reinstateTurn', 'cancelTurn', 'insertTurn']) {
      db[fn].mockResolvedValue({})
    }
  })

  it('recallTurn increments callCount and appends to callLog', async () => {
    const t = makeTurn({
      status: 'called', callCount: 1,
      callLog: [{ callNumber: 1, timestamp: '2026-05-29T10:00:00Z' }],
    })
    store.turns = [t]
    store.activeTurn = { ...t }

    await store.recallTurn()

    expect(store.turns[0].callCount).toBe(2)
    expect(store.turns[0].callLog).toHaveLength(2)
    expect(store.activeTurn.callCount).toBe(2)
    expect(db.recallTurn).toHaveBeenCalledWith(
      expect.objectContaining({ dbId: t.dbId, callCount: 2 })
    )
  })

  it('reinstateFromHistory re-enters a no-show as deferred and reset', async () => {
    const t = makeTurn({ status: 'skipped', callCount: 3, noShowOverride: true })
    store.turns = [t]

    await store.reinstateFromHistory(t.id)

    expect(store.turns[0].status).toBe('deferred')
    expect(store.turns[0].reinstated).toBe(true)
    expect(store.turns[0].callCount).toBe(0)
  })

  it('cancelTurn marks cancelled and clears it if active', async () => {
    const t = makeTurn({ status: 'called', counterId: 1 })
    store.turns = [t]
    store.activeTurn = { ...t }
    store.agentCounterId = 1
    store.counters = [makeCounter({ id: 1, currentTurnId: t.dbId })]

    await store.cancelTurn(t.id)

    expect(store.turns[0].status).toBe('cancelled')
    expect(store.activeTurn).toBeNull()
    expect(store.counters[0].currentTurnId).toBeNull()
  })

  it('createTurn returns the new id/dbId on success', async () => {
    db.insertTurn.mockResolvedValue({ numero: 'L010', id: 'db-new' })
    const res = await store.createTurn('svc-1', 'Ana', '001', [])
    expect(res).toEqual({ id: 'L010', dbId: 'db-new' })
  })

  it('createTurn returns null and surfaces the error on failure', async () => {
    db.insertTurn.mockRejectedValue(new Error('insert failed'))
    const res = await store.createTurn('svc-1', 'Ana', '001', [])
    expect(res).toBeNull()
    expect(store.error).toBe('insert failed')
  })
})

describe('resyncFromServer', () => {
  let store
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    store = useQueueStore()
  })

  it('replaces local state and re-derives the FOH active turn', async () => {
    const called = makeTurn({ status: 'called', calledAt: '2026-05-29T10:00:00Z' })
    db.fetchTurns.mockResolvedValue([called, makeTurn({ status: 'waiting' })])
    db.fetchCounters.mockResolvedValue([])
    store.agentCounterId = null

    await store.resyncFromServer()

    expect(store.turns).toHaveLength(2)
    expect(store.activeTurn.dbId).toBe(called.dbId)
  })
})

describe('setCounter — FOH/agent overlap regression', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useQueueStore()
  })

  it('does not leak a FOH-branch activeTurn into an empty counter', () => {
    // Simulate init() having set activeTurn while agentCounterId was still null.
    store.activeTurn = makeTurn({ status: 'called' })
    store.counters = [makeCounter({ id: 1, currentTurnId: null })]

    store.setCounter(1)

    expect(store.agentCounterId).toBe(1)
    expect(store.activeTurn).toBeNull()
  })

  it('restores the counter in-progress turn on setCounter', () => {
    const t = makeTurn({ status: 'called' })
    store.turns = [t]
    store.counters = [makeCounter({ id: 1, currentTurnId: t.dbId })]

    store.setCounter(1)

    expect(store.activeTurn.dbId).toBe(t.dbId)
  })
})
