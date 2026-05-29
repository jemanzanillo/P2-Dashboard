import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { makeTurn } from './helpers.js'

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

// finishTurn is the cleanest action to exercise reconcileAfterMutationError:
// pre-mutation status 'called' → optimistic 'attended'.
function seedActiveCalledTurn(store) {
  const t = makeTurn({ status: 'called', calledAt: new Date().toISOString() })
  store.turns = [t]
  store.activeTurn = { ...t }
  return t
}

describe('reconcileAfterMutationError', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useQueueStore()
  })

  it('rolls back on a non-timeout error and surfaces the message', async () => {
    const t = seedActiveCalledTurn(store)
    db.finishTurn.mockRejectedValue(new Error('boom'))

    await store.finishTurn()

    expect(store.turns[0].status).toBe('called')        // rolled back
    expect(store.activeTurn?.dbId).toBe(t.dbId)          // restored
    expect(store.error).toBe('boom')
  })

  it('keeps the optimistic change when a timeout hid a successful write', async () => {
    const t = seedActiveCalledTurn(store)
    db.finishTurn.mockRejectedValue(new Error('finishTurn timeout after 10000ms'))
    // DB actually applied the write — canonical row differs from pre-mutation state.
    db.fetchSingleTurn.mockResolvedValue(makeTurn({ dbId: t.dbId, status: 'attended' }))

    await store.finishTurn()

    expect(store.turns[0].status).toBe('attended')       // kept
    expect(store.activeTurn).toBeNull()
  })

  it('rolls back when a timeout reveals the write never landed', async () => {
    const t = seedActiveCalledTurn(store)
    db.finishTurn.mockRejectedValue(new Error('finishTurn timeout after 10000ms'))
    // DB still shows pre-mutation state — the write did not go through.
    db.fetchSingleTurn.mockResolvedValue(makeTurn({ dbId: t.dbId, status: 'called' }))

    await store.finishTurn()

    expect(store.turns[0].status).toBe('called')         // rolled back
    expect(store.activeTurn?.dbId).toBe(t.dbId)          // restored
  })
})
