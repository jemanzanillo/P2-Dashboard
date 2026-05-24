# JM Sequence — Claude Code Session Context
> Paste this entire file at the start of a new Claude Code session.

---

## Project Identity

- **System:** JM Sequence — Hospital queue management (turnos) system
- **Hospital:** Hospital Docente Universitario Traumatológico Dr. Darío Contreras, Santo Domingo, DR
- **Phase:** MVP in active development (design system complete, frontend scaffolded)
- **Solo developer:** Full-stack (frontend + backend + DevOps)
- **Language:** All UX copy in **Spanish**. Code/comments in English.
- **Timezone:** UTC-4 (Dominican Republic)
- **Compliance:** HIPAA-equivalent required for production

---

## Repo Structure

```
jm-sequence/              ← frontend (Vue 3 + Vite)
  src/
    App.vue               ← just <router-view />
    main.js
    queue.js              ← Pinia store (demo state, BroadcastChannel sync)
    router/
      index.js            ← routes: / (Launcher), /foh, /agent
      Launcher.vue        ← dev screen-picker (not production)
      views/
        fohView.vue       ← FOH display (1920×1080 TV) — in progress
        agentView.vue     ← Agent dispatch panel — in progress
  vite.config.js          ← alias @ → src/
  package.json

backend/                  ← NOT YET CREATED (Week 1–2 task)
```

---

## Four User Roles & Screens

| Role | Device | Route | Status |
|------|--------|-------|--------|
| **Paciente** (Kiosk) | 13" tablet | `/kiosk` | ⏳ Not started |
| **Agente** (Agent panel) | Desktop 1440p | `/agent` | 🔨 In progress |
| **Administrador** | Desktop 1440p | `/admin` | ⏳ Not started |
| **FOH** (Public display) | 1920×1080 TV | `/foh` | 🔨 In progress |

---

## Current Frontend Stack

```
Vue 3.5.32        Composition API + <script setup>
Vite 8.0.8        HMR, @ alias to src/
Vue Router 5.0.6  Hash-free history
Pinia 3.0.4       Centralized store (queue.js)
Node.js ≥ 20.19 or ≥ 22.12
```

**Not yet installed (needed):**
- `socket.io-client` — real-time sync
- `axios` — HTTP + JWT interceptors
- `vee-validate` + `zod` — form validation
- `date-fns` — time formatting
- `chart.js` + `vue-chartjs` — admin graphs

---

## Pinia Store (queue.js) — Current Demo State

The store is **local/demo only** (no backend yet). Key shape:

```js
// State
turns[]          // all turns in the system
activeTurn       // currently being attended (null if idle)
counters[]       // ventanillas with serviceIDs[] and status
agentCounterId   // which counter this agent owns (demo: 1)

// Key computed
stats.waiting    // count of 'espera' turns for this agent's services
nextTurn         // highest-priority next turn (especial > regular, then FIFO)
historyItems     // last N completed/noshow turns

// Actions
store.callNext()     // SELECT next turn → set activeTurn
store.finishTurn()   // mark activeTurn as 'finalizado'
store.markNoShow()   // mark activeTurn as 'noshow'
```

Cross-tab sync via `BroadcastChannel('jm-sequence')` + `localStorage` fallback.

---

## Design System

### Typography
- **Display/Numbers:** `Syne` (Google Fonts) — turn numbers at 96px–128px
- **Body/UI:** `Figtree` (Google Fonts)
- **Scale:** Major Third ×1.25 (11 → 13 → 16 → 20 → 24 → 32 → 40 → 48 → 64 → 80 → 96 → 128px)

### Colors — FOH (dark mode, TV screen)
```
Background base:    #07101E  (dark navy)
Background surface: #111C2E
Primary blue:       #1A72FF  (contrast 4.9:1 ✓)
Active green:       #20CB8B  (contrast 9.4:1 ✓ AAA)
Text primary:       #EEF3FF  (off-white)
Text secondary:     rgba(238,243,255, 0.60)
Border:             rgba(255,255,255, 0.12)
Amber/warning:      #F0A429
```

### Colors — BOH (light mode, agent/admin)
```
Background:   #EEF1F6
Primary blue: #1A72FF
Active green: #10B981
Text:         #111827
```

### Spacing (8px grid)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128px`

### Border Radius
`xs=4 · sm=6 · md=8 · lg=12 · xl=16 · 2xl=24 · pill=9999px`

---

## Agent Panel UX Rules (Critical)

1. **One screen, no navigation** — single action loop: Call → Attend → Finish
2. **Giant CTA button** (480×240px target): `LLAMAR SIGUIENTE` / `EN ATENCIÓN`
3. **Keyboard shortcuts:** `Space` = call next · `Enter` = finish · `Esc` = no show
4. **Ventanilla-based config** — agent inherits services from their assigned counter (not self-configured)

### Agent microcopy (in Spanish for production):
```
Idle:    "LLAMAR SIGUIENTE · 7 turnos en espera · Próximo: L014 · Laboratorio · Especial"
Active:  "EN ATENCIÓN · L013 · Laboratorio · Especial (Embarazada)"
Buttons: "Finalizar atención" | "Marcar No show"
```
> **Note:** Current agentView.vue uses English strings (`CALL NEXT`, `IN PROGRESS`, etc.) — needs translation to Spanish.

---

## FOH Screen Layout (1920×1080)

```
┌─────────────────────────────────┬──────────────────┐
│  Header: Hospital name + time   │                  │
├─────────────────────────────────┤                  │
│                                 │  Turno activo    │
│   Video zone (institutional)    │  (large number)  │
│   1120×630px                    │                  │
│                                 │  Historial       │
│                                 │  (8 recent)      │
├─────────────────────────────────┴──────────────────┤
│  Carrusel: Active ventanillas state                │
├────────────────────────────────────────────────────┤
│  Ticker: Hospital announcements                    │
└────────────────────────────────────────────────────┘
```

---

## Priority Algorithm

```sql
SELECT * FROM turnos
WHERE estado = 'espera'
  AND servicio_id = ANY($counterServiceIDs)
ORDER BY
  CASE WHEN prioridad = 'especial' THEN 0 ELSE 1 END,
  created_at ASC
LIMIT 1
FOR UPDATE;
```

**Priority levels:** `especial` (pregnant, elderly, disabled) > `regular` — both FIFO within level.

---

## Backend (Planned — Week 1–2)

**Stack:** Node.js · Hono · Socket.io · PostgreSQL · JWT + httpOnly cookies

### DB Tables
```
turnos        id, numero, servicio_id, ventanilla_id, prioridad,
              estado (espera|llamado|finalizado|noshow),
              patient_name?, id_number?, special_condition?,
              created_at, called_at, finished_at

ventanillas   id, label, servicio_ids[], status (active|inactive)

usuarios      id, nombre, rol (agente|admin), ventanilla_id, password_hash

auditoria     id, timestamp, user_id, accion, turno_id, metadata_json
              ← IMMUTABLE: INSERT only, never UPDATE/DELETE
```

### Key API Endpoints
```
POST /api/turnos                    → create turn (kiosk)
POST /api/turnos/:id/llamar         → call turn (agent) — row-locked transaction
POST /api/turnos/:id/finalizar      → finish turn
POST /api/turnos/:id/noshow         → mark no-show
POST /api/turnos/:id/imprimir       → generate ESC/POS for thermal printer

GET  /api/ventanillas               → list counters + their queue counts
PUT  /api/ventanillas/:id           → admin: update service assignment

POST /api/auth/login                → JWT → httpOnly cookie
POST /api/auth/logout
```

### Socket.io Events
```
turno_creado      → FOH updates historial
turno_llamado     → FOH flashes active number; agent sees EN ATENCIÓN
turno_finalizado  → remove from historial
config_actualizada → agent at ventanilla notified of service change
```

---

## Critical Design Decisions (Don't Break These)

1. **Agents never self-configure** — they log in at a ventanilla and inherit its services
2. **Race condition protection** — `FOR UPDATE` row lock when calling next turn
3. **Audit log is immutable** — only `INSERT`, never `UPDATE`/`DELETE`
4. **Printer is backend-only** — frontend POSTs to `/imprimir`, backend sends ESC/POS via USB
5. **FOH syncs via WebSocket** — `<100ms` target; reconnect restores state via GET
6. **No UI library** — vanilla Vue components only (full design system control)

---

## UX Copy Standards

| ❌ Don't use | ✅ Use instead | Why |
|---|---|---|
| "Último turno" | "Turno llamado" | Action-oriented |
| "Turno en llamada" | "Tu turno" | More intimate |
| "Ventanilla" alone | "Diríjase a ventanilla [X]" | Verb + specific |
| ALL CAPS service names | Sentence case | Readability at distance |
| "Caja" | "Estación" | No jargon |

---

## Immediate Next Tasks (in order)

1. **Translate** `agentView.vue` strings to Spanish
2. **Install** Socket.io-client, Axios, date-fns in frontend
3. **Add routes** for `/kiosk` and `/admin` to `router/index.js`
4. **Create** `backend/` folder with Hono + PostgreSQL skeleton
5. **Docker Compose** with PostgreSQL + backend service
6. **Implement** auth flow (login → JWT → ventanilla assignment)
7. **Wire** `queue.js` store to real API + Socket.io (replace BroadcastChannel demo)

---

## Key File References in Project

| File | Purpose |
|------|---------|
| `jmsequence-design-system-v1.html` | Complete visual design tokens — source of truth for all colors, type, spacing |
| `PROJECT_SUMMARY.md` | Full product spec, architecture decisions, roadmap |
| `variables.json` | Figma variable export (4 collections, 96 vars) |
| `Rediseño_Interfaz_Turnos_Hospitalarios__After.pdf` | UI redesign reference (After state) |

---

*Generated from Claude.ai project context — May 2026*
