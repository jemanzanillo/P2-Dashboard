# JM Sequence — Claude Code Session Context
> Paste this entire file at the start of a new Claude Code session.

---

## Project Identity

- **System:** JM Sequence — Hospital queue management (turnos) system
- **Hospital:** Hospital Docente Universitario Traumatológico Dr. Darío Contreras, Santo Domingo, DR
- **Phase:** MVP complete — all 5 screens built and wired to Supabase backend, QA & production hardening in progress
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
    locale.js             ← Pinia locale store (ES/EN translation system)
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
        loginView.vue     ← login page (Supabase Auth, Spanish) — ✅ complete
        fohView.vue       ← FOH display (1920×1080 TV) — ✅ complete
        agentView.vue     ← Agent dispatch panel — ✅ complete
        kioskView.vue     ← Kiosk turn creation (tablet) — ✅ complete
        adminView.vue     ← Admin dashboard (counter mgmt, stats) — ✅ complete
  vite.config.js          ← alias @ → src/
  package.json
```

---

## Four User Roles & Screens

| Role | Device | Route | Status |
|------|--------|-------|--------|
| **Paciente** (Kiosk) | 13" tablet | `/kiosk` | ✅ Complete |
| **Agente** (Agent panel) | Desktop 1440p | `/agent` | ✅ Complete |
| **Administrador** | Desktop 1440p | `/admin` | ✅ Complete |
| **FOH** (Public display) | 1920×1080 TV | `/foh` | ✅ Complete |
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

**Recommended for next phase:**
- `date-fns` — comprehensive time formatting (can add later if needed)
- `chart.js` + `vue-chartjs` — admin analytics graphs
- `vee-validate` + `zod` — form validation (consider for kiosk input validation)

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
> **Note:** Strings are managed via `locale.js` (Pinia store). All UX copy is Spanish; English strings in code use translation keys like `locale.t('agent.callNext')`.

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

1. **Testing & QA** — user acceptance testing across all 5 screens (kiosk, agent, admin, FOH, login)
2. **Install** `date-fns` — needed for comprehensive time formatting/display
3. **Install** `chart.js` + `vue-chartjs` — admin graphs & analytics
4. **Debug & refine** — fix any edge cases, optimize Realtime sync, smooth out animations
5. **ESC/POS printing** — finalize if handled via Supabase Edge Function or separate service
6. **Production hardening** — environment setup, rate limiting, error tracking (Sentry/similar)
7. **Documentation** — API docs, deployment runbook, hospital staff training materials

---

## Key File References in Project

| File | Purpose |
|------|---------|
| `jmsequence-design-system-v1.html` | Complete visual design tokens — source of truth for all colors, type, spacing |
| `PROJECT_SUMMARY.md` | Full product spec, architecture decisions, roadmap |
| `variables.json` | Figma variable export (4 collections, 96 vars) |
| `Rediseño_Interfaz_Turnos_Hospitalarios__After.pdf` | UI redesign reference (After state) |

---

---

## What's Been Built (Recent Sessions)

- ✅ **All 5 screens** complete and functional (kiosk, agent, admin, FOH, login)
- ✅ **Supabase backend** live with Realtime sync (<100ms propagation)
- ✅ **Admin dashboard** — counter management, service assignment, system config
- ✅ **Agent panel** — 3-call protocol with 30s cooldown, session tracking
- ✅ **FOH display** — live turn announcements, video zone, counter carousel, history
- ✅ **Kiosk** — 5-step flow for turn creation with special conditions
- ✅ **Audio system** — Web Audio chimes + Web Speech TTS (Spanish es-419)
- ✅ **Locale system** — bilingual (ES/EN) via Pinia store
- ✅ **Auth guards** — role-based routing (admin, agente)
- ✅ **Fixed:** auth.int hanging issue, single session problem, kiosk Realtime subscription

*Last updated: 2026-05-26 — all screens MVP-complete, ready for QA & production setup*

---

## Security & RLS Strategy (Pre-Production Hardening)

### Current MVP Security Posture

**Status:** Row-Level Security (RLS) is **DISABLED on all public tables** for MVP development speed.

| Table | RLS | Impact | Timeline |
|-------|-----|--------|----------|
| `turnos` | ❌ OFF | Anon users can query all turns (not just their own) | ⚠️ **Must enable before production** |
| `turno_condiciones` | ❌ OFF | Anon users can see all turn-condition mappings | ⚠️ **Must enable before production** |
| `servicios` | ❌ OFF | Public list (no PII) — acceptable long-term | ✓ Low priority |
| `condiciones_especiales` | ❌ OFF | Public reference data — acceptable long-term | ✓ Low priority |
| `profiles` | ❌ OFF | User directory visible to authenticated users | ⚠️ **Should restrict** |
| `ventanillas` | ❌ OFF | Counter list visible to all authenticated | ⚠️ **Should restrict** |

**Why it's acceptable for MVP:**
- Hospital is internal network (not public internet)
- Data set is small (few turns per day during MVP)
- Kiosk has no authentication (anonymous patient), so RLS granularity is limited anyway
- Development velocity prioritized over enterprise security
- RLS complexity adds significant overhead early in the project

**Why it must change for production:**
- HIPAA-equivalent compliance requires access controls
- Patient privacy: no patient should see other patients' turns
- Regulatory risk: violations can result in fines/liability
- Scalability: as patient volume grows, data isolation becomes mandatory

---

### Production RLS Implementation Roadmap

#### Phase 1: Kiosk Isolation (Highest Priority)

Kiosk runs as `anon` user. Currently can query all turnos. Should be blocked entirely:

```sql
-- 1. Disable SELECT on turnos for anon (kiosk doesn't need to see turns)
CREATE POLICY "anon_cannot_view_turns" ON public.turnos
  FOR SELECT USING (false);

-- 2. Allow anon to INSERT only (for creating new turns)
CREATE POLICY "anon_can_create_turn" ON public.turnos
  FOR INSERT WITH CHECK (true);

-- 3. Allow anon to update only their own turn (by id) if we add ownership tracking
-- For now, INSERT-only is sufficient for MVP kiosk

-- 4. Same for turno_condiciones — insert-only
CREATE POLICY "anon_insert_conditions" ON public.turno_condiciones
  FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_cannot_view_conditions" ON public.turno_condiciones
  FOR SELECT USING (false);

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_condiciones ENABLE ROW LEVEL SECURITY;
```

#### Phase 2: Agent Access Control

Agents see only turns for their assigned services/counter:

```sql
-- Agents can view only turns for services assigned to their ventanilla
CREATE POLICY "agent_view_assigned_turns" ON public.turnos
  FOR SELECT USING (
    servicio_id = ANY(
      SELECT servicio_id 
      FROM public.ventanilla_servicios 
      WHERE ventanilla_id = (
        SELECT ventanilla_id 
        FROM public.profiles 
        WHERE id = auth.uid()
      )
    )
  );

-- Agents can update (call, finish, etc.) only their assigned turns
CREATE POLICY "agent_update_assigned_turns" ON public.turnos
  FOR UPDATE USING (
    ventanilla_id = (
      SELECT ventanilla_id 
      FROM public.profiles 
      WHERE id = auth.uid()
    )
  );

-- Agents can see conditions only for their visible turns (via JOIN)
CREATE POLICY "agent_view_conditions" ON public.turno_condiciones
  FOR SELECT USING (
    turno_id IN (
      SELECT id FROM public.turnos 
      WHERE servicio_id = ANY(...)  -- same logic as above
    )
  );
```

#### Phase 3: Admin Full Access

```sql
-- Admins have full unrestricted access (role-based at application level)
-- RLS can be bypassed with SECURITY DEFINER functions if needed
-- Recommend: use service_role key (server-side only) for admin operations
```

#### Phase 4: FOH Display (Public but Read-Only)

FOH runs authenticated (as `foh` role or dedicated service account):

```sql
-- FOH can SELECT live turns but not modify
CREATE POLICY "foh_view_all_turns" ON public.turnos
  FOR SELECT USING (
    current_setting('request.jwt.claims')::json->>'role' = 'foh'
  );

-- No INSERT/UPDATE/DELETE permissions
```

---

### Implementation Checklist

- [ ] Create Supabase SQL migration: `add_rls_policies_phase1_kiosk`
- [ ] Test: Kiosk can INSERT but not SELECT
- [ ] Test: Anon key cannot see existing turns
- [ ] Create migration: `add_rls_policies_phase2_agents`
- [ ] Test: Agent A sees only their service's turns
- [ ] Test: Agent B cannot see Agent A's counter's turns
- [ ] Create migration: `add_rls_policies_phase3_admin`
- [ ] Test: Admin (service_role key) has full access
- [ ] Create migration: `add_rls_policies_phase4_foh`
- [ ] Test: FOH displays current turns without modification access
- [ ] Document RLS exceptions (if any) with security justification
- [ ] Security audit: external review of policies before production release
- [ ] Update deployment runbook with RLS setup steps

---

### Special Cases & Exceptions

**Case 1: Kiosk turn ownership**
Currently, kiosk doesn't track which patient created which turn (anon users have no identity).
If future requirement: add `kiosk_session_id` or `patient_phone` to turnos, allow kiosk to view only their own.

**Case 2: Printing (ESC/POS)**
If printing service is a separate backend service with server-side key, it has full access.
RLS applies only to anon/authenticated client keys, not service_role.

**Case 3: Realtime subscriptions**
Supabase Realtime respects RLS policies — agents will only receive turn updates for their service.
Test thoroughly: subscribe to `turnos` table and verify anon receives nothing (blocked by SELECT policy).

---

### Migration Execution (When Ready for Production)

```bash
# 1. Enable RLS on critical tables (in order)
supabase migration new add_rls_policies_phase1_kiosk
# → write SQL from above, test locally with `supabase test` 

# 2. Deploy to staging
supabase db push --project-ref staging

# 3. Run full integration tests (kiosk, agent, admin, FOH)

# 4. If all green, deploy to production
supabase db push --project-ref production

# 5. Monitor error logs for any unexpected "permission denied" errors
```

---

### References

- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Hospital HIPAA Compliance Checklist](https://www.hhs.gov/hipaa/for-professionals/security/index.html)

**Owner:** DevOps/Security lead  
**Priority:** P0 (blocking production release)  
**Estimate:** 1–2 sprints (design, implement, test, audit)
