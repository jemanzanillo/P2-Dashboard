# JM Sequence — Claude Code Session Context
> Paste this entire file at the start of a new Claude Code session.

---

## Project Identity

- **System:** JM Sequence — Hospital queue management (turnos) system
- **Hospital:** Hospital Docente Universitario Traumatológico Dr. Darío Contreras, Santo Domingo, DR
- **Phase:** MVP in active development — Supabase backend live, core agent + FOH views functional
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
    main.js               ← bootstraps Pinia, router, auth.init()
    auth.js               ← Pinia auth store (Supabase Auth + profiles)
    queue.js              ← Pinia queue store (wired to Supabase + Realtime)
    style.css
    lib/
      supabase.js         ← Supabase client (env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
      db.js               ← all DB queries/mutations + Realtime subscription
    composables/
      useTurnAnnouncer.js ← Web Audio chime + Web Speech TTS (es-419)
    router/
      index.js            ← routes + auth guard
      Launcher.vue        ← dev screen-picker (not production)
      views/
        loginView.vue     ← login page (Supabase Auth, Spanish) — complete
        fohView.vue       ← FOH display (1920×1080 TV) — in progress
        agentView.vue     ← Agent dispatch panel — in progress
        kioskView.vue     ← Kiosk turn creation (tablet) — in progress
  vite.config.js          ← alias @ → src/
  package.json
```

---

## Four User Roles & Screens

| Role | Device | Route | Status |
|------|--------|-------|--------|
| **Paciente** (Kiosk) | 13" tablet | `/kiosk` | 🔨 In progress |
| **Agente** (Agent panel) | Desktop 1440p | `/agent` | 🔨 In progress |
| **Administrador** | Desktop 1440p | `/admin` | ⏳ Not started |
| **FOH** (Public display) | 1920×1080 TV | `/foh` | 🔨 In progress |
| *(Auth)* | Any | `/login` | ✅ Complete |

---

## Current Frontend Stack

```
Vue 3.5.32              Composition API + <script setup>
Vite 8.0.8              HMR, @ alias to src/
Vue Router 5.0.6        Hash-free history
Pinia 3.0.4             Centralized stores (auth.js, queue.js)
@supabase/supabase-js   DB queries, Auth, Realtime
@supabase/ssr           SSR-safe session helpers
Node.js ≥ 20.19 or ≥ 22.12
```

**Still needed (not yet installed):**
- `date-fns` — time formatting
- `chart.js` + `vue-chartjs` — admin graphs
- `vee-validate` + `zod` — form validation

---

## Auth Flow

Auth is handled entirely by **Supabase Auth**. No custom JWT or Hono backend needed.

```
/login  →  supabase.auth.signInWithPassword()
        →  onAuthStateChange() updates auth store
        →  fetchProfile() loads profiles + ventanillas join
        →  router redirects: admin → /admin, agente → /agent
```

**Pinia auth store (`auth.js`):**
```js
user       // Supabase auth user (null if logged out)
profile    // { id, nombre, rol, ventanilla_id, ventanillas: {...} }

auth.init()    // call once at app boot — restores session
auth.login(email, password)
auth.logout()
```

**Router guard (router/index.js):**
```js
meta: { requiresAuth: true }   // redirect to /login if not authenticated
meta: { requiresAdmin: true }  // redirect to /agent if rol !== 'admin'
```

---

## Pinia Queue Store (queue.js)

The store is **fully wired to Supabase** (no more demo/BroadcastChannel state).

```js
// State
turns[]          // all active turns fetched from DB
activeTurn       // currently being attended (null if idle)
counters[]       // ventanillas with currentTurnId
agentCounterId   // which counter this agent owns
initialized      // true after first load
loading / error  // async state

// Key computed (derived from turns[])
stats.waiting    // count of 'waiting' turns for this agent's services
nextTurn         // highest-priority next turn (special > normal, then FIFO)
historyItems     // last N completed/noshow turns

// Actions
store.init()             // load turns + counters, subscribe to Realtime
store.callNext()         // call next turn → DB update → activeTurn set
store.recallActiveTurn() // recall current turn (increments call_count)
store.finishTurn()       // mark activeTurn as 'atendido'
store.markNoShow()       // mark activeTurn as 'noshow'
store.reinstateTurn()    // reinstate a noshow → 'diferido'
store.suspendTurn()      // defer turn temporarily → 'diferido'
store.cancelTurn()       // cancel turn with motivo
```

Realtime sync via **Supabase postgres_changes** (replaces BroadcastChannel).

---

## Database Layer (src/lib/db.js)

All DB access goes through `db.js`. Never import `supabase` directly in components.

### Turn states
```
espera     → waiting to be called
llamado    → called (being summoned to counter)
diferido   → deferred (temporarily suspended or reinstated no-show)
atendido   → attended/finished successfully
noshow     → did not appear
cancelado  → cancelled by agent
```

### Key turn fields (beyond the basics)
```
call_count            // how many times this turn has been called
call_log[]            // [{callNumber, timestamp}, ...] history
reinstated            // bool — was a no-show reinstated?
no_show_occurred      // bool
no_show_override      // bool — agent overrode no-show warning
puede_atender_desde   // deferred turns: earliest time they can be called again
tiempo_espera_segundos
tiempo_atencion_segundos
turno_condiciones[]   // join → condiciones_especiales (nombre, icono)
```

### DB Tables (Supabase PostgreSQL)
```
turnos            id (uuid), numero, servicio_id, ventanilla_id, prioridad,
                  estado, paciente_nombre, paciente_id_number,
                  created_at, called_at, atencion_inicio_at, finished_at,
                  call_count, call_log, reinstated,
                  no_show_occurred, no_show_override,
                  puede_atender_desde, tiempo_espera_segundos,
                  tiempo_atencion_segundos, motivo_anulacion

turno_condiciones turno_id, condicion_id  ← many-to-many join

condiciones_especiales  id, nombre, icono  ← e.g. Embarazada, Adulto mayor, Discapacitado

ventanillas       id (uuid), numero, etiqueta, estado (activa|inactiva),
                  agente_id, es_prioritaria

servicios         id, nombre, nombre_corto, prefijo_turno, color_token

profiles          id (= auth.users.id), nombre, rol (agente|admin),
                  ventanilla_id, → ventanillas(*)
```

### Key db.js functions
```js
fetchTurns()                         // load all recent turns
fetchSingleTurn(uuid)                // load one turn by DB id
fetchCounters()                      // load ventanillas + active turn map
insertTurn({ serviceId, patientName, idNumber, condicionIds })
callTurn({ dbId, ventanillaId, calledAt })
recallTurn({ dbId, callCount, callLog })
finishTurn({ dbId, durationSeconds })
markNoShow({ dbId, override, durationSeconds })
reinstateTurn({ dbId })              // → estado: 'diferido', resets call tracking
suspendTurn({ dbId })                // → estado: 'diferido', sets puede_atender_desde
cancelTurn({ dbId, motivo })
subscribeToChanges({ onTurnoChange, onVentanillaChange })  // Supabase Realtime
```

---

## useTurnAnnouncer Composable

`src/composables/useTurnAnnouncer.js` — audio announcements for FOH.

- **Chime:** Web Audio API, A5–C6–E6 major triad (sine oscillators with envelope)
  - Normal call: ascending notes
  - Recall: descending notes (reversed)
- **TTS:** Web Speech API (`es-419` locale, prefers female Latin American voice)
  - Text: `"Turno {letter}, {digits}. Diríjase a ventanilla {counterId}."`
  - TTS fires ~1s after chime completes
- **AudioContext activation:** user gesture required; pending announcements queue until unlocked

```js
const { audioReady, announce, requestAudioPermission } = useTurnAnnouncer()

announce(turn)           // play chime + TTS
announce(turn, true)     // recall (reversed chime, shorter delay)
requestAudioPermission() // call on first user interaction to unlock AudioContext
```

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
> **Note:** `agentView.vue` still uses English strings (`CALL NEXT`, `IN PROGRESS`, etc.) — needs translation to Spanish.

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
WHERE estado IN ('espera', 'diferido')
  AND servicio_id = ANY($counterServiceIDs)
  AND (puede_atender_desde IS NULL OR puede_atender_desde <= NOW())
ORDER BY
  CASE WHEN prioridad = 'especial' THEN 0 ELSE 1 END,
  created_at ASC
LIMIT 1;
```

**Priority levels:** `especial` (pregnant, elderly, disabled) > `regular` — both FIFO within level.
Deferred turns (`diferido`) re-enter the queue only after `puede_atender_desde`.

---

## Critical Design Decisions (Don't Break These)

1. **Agents never self-configure** — they log in at a ventanilla and inherit its services
2. **No raw supabase in components** — always go through `db.js` or the queue store
3. **Audit trail via call_log** — every call/recall is appended to `call_log[]`; never overwrite
4. **Printer is backend-only** — frontend POSTs to `/imprimir`, backend sends ESC/POS via USB
5. **FOH syncs via Supabase Realtime** — postgres_changes subscription; `<100ms` target
6. **No UI library** — vanilla Vue components only (full design system control)
7. **Auth is Supabase only** — no custom JWT; `profiles` table extends `auth.users`

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

1. **Translate** `agentView.vue` strings to Spanish (still uses English)
2. **Add `/admin` route** to `router/index.js` with `requiresAdmin` guard
3. **Build** `adminView.vue` — counter management, service assignment, stats
4. **Install** `date-fns` — needed for time formatting in agent/FOH views
5. **Wire FOH** `fohView.vue` to live queue store + `useTurnAnnouncer`
6. **Kiosk:** wire `kioskView.vue` to `store.createTurn()` / `db.insertTurn()`
7. **ESC/POS printing** — decide if handled via Supabase Edge Function or separate service

---

## Key File References in Project

| File | Purpose |
|------|---------|
| `jmsequence-design-system-v1.html` | Complete visual design tokens — source of truth for all colors, type, spacing |
| `PROJECT_SUMMARY.md` | Full product spec, architecture decisions, roadmap |
| `variables.json` | Figma variable export (4 collections, 96 vars) |
| `Rediseño_Interfaz_Turnos_Hospitalarios__After.pdf` | UI redesign reference (After state) |

---

*Last updated: May 2026 — reflects Supabase backend, live queue store, auth flow*
