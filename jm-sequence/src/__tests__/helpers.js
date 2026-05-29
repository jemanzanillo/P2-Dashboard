// Shared test helpers for the queue store tests.
// NOT a test file itself (vite.config `include` only matches *.test.js).

let _seq = 0

// Build a turn object in the shape mapTurnRow() produces (what queue.js works with).
export function makeTurn(overrides = {}) {
  _seq += 1
  return {
    id:               `L${String(_seq).padStart(3, '0')}`,
    dbId:             `db-${_seq}`,
    serviceID:        'svc-1',
    serviceLabel:     'Laboratorio',
    servicePrefijo:   'L',
    priority:         'normal',
    status:           'waiting',
    createdAt:        new Date(2026, 4, 29, 10, 0, _seq).toISOString(),
    calledAt:         null,
    patientName:      'Paciente',
    idNumber:         '',
    specialCondition: 'Normal',
    callCount:        0,
    callLog:          [],
    lastCalledAt:     null,
    durationMs:       null,
    reinstated:       false,
    noShowOccurred:   false,
    noShowOverride:   false,
    counterId:        null,
    ...overrides,
  }
}

export function makeCounter(overrides = {}) {
  return { id: 1, currentTurnId: null, serviceIDs: ['svc-1'], ...overrides }
}

// Let queued microtasks (the .then() chains in the Realtime handlers) settle.
export async function flush() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}
