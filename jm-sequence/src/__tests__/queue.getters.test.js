import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { makeTurn, makeCounter } from './helpers.js'

// db.js is mocked so the store never touches Supabase. Getters don't call db,
// but the import must resolve.
vi.mock('@/lib/db.js', () => ({
  testConnection: vi.fn(), fetchTurns: vi.fn(), fetchCounters: vi.fn(),
  fetchServices: vi.fn(), fetchConditions: vi.fn(), fetchSingleTurn: vi.fn(),
  mapTurnRow: vi.fn(), insertTurn: vi.fn(), callTurn: vi.fn(), recallTurn: vi.fn(),
  finishTurn: vi.fn(), markNoShow: vi.fn(), reinstateTurn: vi.fn(),
  suspendTurn: vi.fn(), cancelTurn: vi.fn(), transferTurn: vi.fn(),
  subscribeToChanges: vi.fn(), clearCorruptedSession: vi.fn(),
}))

import { useQueueStore } from '@/queue.js'

describe('queue getters — priority algorithm', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useQueueStore()
  })

  it('orders waitingTurns: reinstated > special > FIFO by createdAt', () => {
    const fifoOld = makeTurn({ createdAt: '2026-05-29T10:00:00Z' })
    const fifoNew = makeTurn({ createdAt: '2026-05-29T10:05:00Z' })
    const special = makeTurn({ priority: 'special', createdAt: '2026-05-29T10:10:00Z' })
    const reinstated = makeTurn({ reinstated: true, status: 'deferred', createdAt: '2026-05-29T10:20:00Z' })

    store.turns = [fifoNew, special, fifoOld, reinstated]

    const order = store.waitingTurns.map(t => t.dbId)
    expect(order).toEqual([reinstated.dbId, special.dbId, fifoOld.dbId, fifoNew.dbId])
    expect(store.nextTurn.dbId).toBe(reinstated.dbId)
  })

  it('includes only waiting/deferred turns', () => {
    store.turns = [
      makeTurn({ status: 'waiting' }),
      makeTurn({ status: 'deferred' }),
      makeTurn({ status: 'called' }),
      makeTurn({ status: 'attended' }),
      makeTurn({ status: 'cancelled' }),
    ]
    expect(store.waitingTurns).toHaveLength(2)
  })

  it('filters by the agent counter service list when agentCounterId is set', () => {
    const mine = makeTurn({ serviceID: 'svc-A' })
    const other = makeTurn({ serviceID: 'svc-B' })
    store.turns = [mine, other]
    store.counters = [makeCounter({ id: 7, serviceIDs: ['svc-A'] })]
    store.agentCounterId = 7

    expect(store.waitingTurns.map(t => t.dbId)).toEqual([mine.dbId])
  })

  it('FOH/kiosk (agentCounterId null) sees the full queue', () => {
    store.turns = [makeTurn({ serviceID: 'svc-A' }), makeTurn({ serviceID: 'svc-B' })]
    store.agentCounterId = null
    expect(store.waitingTurns).toHaveLength(2)
  })

  it('history filters attended/skipped with calledAt and sorts newest first', () => {
    const older = makeTurn({ status: 'attended', calledAt: '2026-05-29T09:00:00Z' })
    const newer = makeTurn({ status: 'skipped', calledAt: '2026-05-29T11:00:00Z' })
    const noCall = makeTurn({ status: 'attended', calledAt: null })
    const waiting = makeTurn({ status: 'waiting' })
    store.turns = [older, newer, noCall, waiting]

    expect(store.history.map(t => t.dbId)).toEqual([newer.dbId, older.dbId])
  })

  it('stats counts waiting/called/attended/skipped correctly', () => {
    store.turns = [
      makeTurn({ status: 'waiting' }),
      makeTurn({ status: 'deferred' }),
      makeTurn({ status: 'called' }),
      makeTurn({ status: 'attended' }),
      makeTurn({ status: 'skipped', noShowOccurred: true }),
    ]
    expect(store.stats).toEqual({ waiting: 2, called: 3, attended: 1, skipped: 1 })
  })
})
