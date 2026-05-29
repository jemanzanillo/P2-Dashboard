# JM Sequence — QA Checklist

Repeatable manual test script. Run a **full pass before each production release** and after any change to `queue.js`, `db.js`, `auth.js`, or the Realtime/RLS layer.

Automated unit tests (`pnpm test:run`) cover the queue logic. This checklist covers what unit tests **cannot**: real Supabase Realtime, audio hardware, multiple browsers/devices, and cross-tab/session behavior.

**Devices needed:** kiosk tablet (13"), agent desktop, admin desktop, FOH TV (1920×1080), plus a phone (Android Chrome) for TTS.

Legend: ⬜ not run · ✅ pass · ❌ fail (file an issue)

---

## 0. Pre-flight

| # | Step | Expected | Result |
|---|------|----------|--------|
| 0.1 | `pnpm test:run` | All tests green | ⬜ |
| 0.2 | `pnpm build` | Builds with no errors | ⬜ |
| 0.3 | Confirm `.env` points at the correct Supabase project | URL/key match target env | ⬜ |
| 0.4 | Seed/verify test data exists (services, ventanillas, an agent + admin profile) | Login + kiosk usable | ⬜ |

---

## 1. Login (`/login`) — all browsers

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1.1 | Log in as **admin** | Redirects to `/admin` | ⬜ |
| 1.2 | Log in as **agente** | Redirects to `/agent` | ⬜ |
| 1.3 | Wrong password | Spanish error, no redirect | ⬜ |
| 1.4 | Visit `/agent` while logged out | Redirected to `/login` | ⬜ |
| 1.5 | Non-admin visits `/admin` | Redirected to `/agent` | ⬜ |
| 1.6 | Log out | Returns to `/login`, no stale session, no redirect loop | ⬜ |

---

## 2. Kiosk (`/kiosk`) — tablet

| # | Step | Expected | Result |
|---|------|----------|--------|
| 2.1 | Idle → tap to start | Service selection appears | ⬜ |
| 2.2 | Select a service, enter name + ID, confirm | Success screen with turn number (e.g. `L014`) | ⬜ |
| 2.3 | Create turn with a **special condition** (e.g. Embarazada) | Turn created; appears as special/priority for agent | ⬜ |
| 2.4 | Leave success screen idle | Auto-resets after ~15s countdown | ⬜ |
| 2.5 | Live per-service waiting counts | Match the actual queue | ⬜ |
| 2.6 | Submit with missing name/ID | Validation blocks, Spanish message | ⬜ |

---

## 3. Agent (`/agent`) — desktop

| # | Step | Expected | Result |
|---|------|----------|--------|
| 3.1 | Counter + service list inherited from assigned ventanilla | Correct services, not self-configured | ⬜ |
| 3.2 | Waiting count + "Próximo" preview | Matches queue, special turns first | ⬜ |
| 3.3 | Press **Space** / click LLAMAR SIGUIENTE | Next turn becomes active, panel shows patient + service | ⬜ |
| 3.4 | Recall active turn | callCount increments, FOH re-announces | ⬜ |
| 3.5 | 3-call cooldown / 30s ring | Cooldown timer behaves, ring animates | ⬜ |
| 3.6 | Press **Enter** / Finalizar atención | Turn → attended, panel clears, ready for next | ⬜ |
| 3.7 | Press **Esc** / Marcar No show | Turn → skipped (with confirm), panel clears | ⬜ |
| 3.8 | Suspend (defer) active turn | Turn → deferred, re-enters queue later | ⬜ |
| 3.9 | Transfer active turn to another counter | Turn leaves this counter, appears at target | ⬜ |
| 3.10 | Cancel a turn with motivo | Turn → cancelled, removed from queue | ⬜ |
| 3.11 | Reinstate a no-show from history | Turn → deferred, re-enters queue (priority) | ⬜ |
| 3.12 | **Refresh the page mid-attention** | Active turn is restored (not lost) | ⬜ |

---

## 4. Admin (`/admin`) — desktop

| # | Step | Expected | Result |
|---|------|----------|--------|
| 4.1 | Overview stats | Reflect live queue (waiting/called/attended/skipped) | ⬜ |
| 4.2 | Edit a counter label / priority | Saves; reflected on FOH carousel | ⬜ |
| 4.3 | Assign/replace services on a counter | Agent at that counter sees the new service set | ⬜ |
| 4.4 | Edit an agent profile (name/role/counter) | Saves; agent inherits new counter on next login | ⬜ |
| 4.5 | Change a system config value | Persists; behavior updates where applicable | ⬜ |

---

## 5. FOH (`/foh`) — TV 1920×1080

| # | Step | Expected | Result |
|---|------|----------|--------|
| 5.1 | First load → audio activation overlay | Tapping unlocks AudioContext | ⬜ |
| 5.2 | Agent calls a turn | Active turn panel updates, chime + TTS plays | ⬜ |
| 5.3 | TTS phrasing | "Turno {letra}, {dígitos}. Diríjase a ventanilla {N}." | ⬜ |
| 5.4 | Recall | Descending chime variant plays | ⬜ |
| 5.5 | History list | Shows ~8 most recent, newest first | ⬜ |
| 5.6 | Counter carousel | Active ventanillas shown with current turn | ⬜ |
| 5.7 | Video zone | Institutional video plays | ⬜ |
| 5.8 | Layout at exactly 1920×1080 | No overflow/clipping | ⬜ |

---

## 6. Cross-device / regression scenarios (HIGH RISK)

These reproduce real bugs from the project history — give them extra attention.

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| 6.1 | **Two agents** call turns within the same second | **Both** chimes + TTS play on FOH (no silenced first announcement) | ⬜ |
| 6.2 | Agent logged in on Tab A; **different agent** logs in on Tab B | Tab A session is **not** overwritten; A still shows its own counter | ⬜ |
| 6.3 | Logout on one tab | Only that tab signs out; other agents stay logged in | ⬜ |
| 6.4 | Background the FOH tab **10+ min**, then foreground | State resyncs, no stale turns, Realtime reconnects | ⬜ |
| 6.5 | Kill Wi-Fi mid-shift on agent, then restore | UI recovers (resync + reconnect), no stuck "cargando" | ⬜ |
| 6.6 | Agent clicks an action while tab is backgrounded | Optimistic update applies; reconciles on return, no stuck UI | ⬜ |
| 6.7 | **Android Chrome / Samsung Browser** on FOH | TTS voice actually speaks (not just chime) | ⬜ |
| 6.8 | Corrupt/expire the session token, then load | "Sesión expirada" message, no infinite spinner | ⬜ |
| 6.9 | Kiosk creates a turn while agent + FOH are open | Turn appears **once** (no duplicate) within ~100ms | ⬜ |
| 6.10 | Two agents on different counters, simultaneous activity for ~5 min | No cross-counter state bleed; each sees only its own active turn | ⬜ |

---

## 7. Sign-off

- [ ] All sections passed on target devices
- [ ] Failures filed with repro steps
- [ ] RLS enabled and section 6 re-run **with RLS on** (see plan Tier 3)
- Tester: ______________  Date: ____________  Build/commit: ____________
