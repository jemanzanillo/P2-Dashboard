# Implementation Plan — Login View + Router Fix

## Scope
Supabase Realtime is already implemented (db.js / queue.js). No BroadcastChannel exists.
Tasks are: (1) fix broken router, (2) create login view.

---

## Files

| File | Action | Change |
|------|--------|--------|
| `src/router/index.js` | [MODIFY] | Fix structure: define router first, add imports, add `/login` route, move guard after createRouter |
| `src/router/views/loginView.vue` | [NEW] | Login form — email + password, calls auth.login(), redirects by role |

---

## router/index.js changes
- Add `import { useAuthStore } from '@/auth'`
- Fix `.` typo on KioskView lazy import
- Add `LoginView` lazy import
- Add `{ path: '/login', component: LoginView }` route
- Move `router.beforeEach` AFTER `createRouter` (currently fires before router exists)
- Add `{ meta: { requiresAuth: true } }` to `/agent`, `/foh`, `/kiosk`
- Export router

## loginView.vue
- Dark card centered on `#07101E` background (FOH palette — matches kiosk/hospital feel)
- Hospital logo placeholder + "JM Sequence" wordmark
- Email + Password fields (Figtree font)
- "Iniciar sesión" submit button (primary blue #1A72FF)
- Error message display on failed login
- On success: redirect to `/agent` (or `/admin` if profile.rol === 'admin')
- No register link (accounts are admin-provisioned)
