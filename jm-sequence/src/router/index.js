import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/auth'
import Launcher from './Launcher.vue'

const FohView   = () => import('./views/fohView.vue')
const AgentView = () => import('./views/agentView.vue')
const KioskView = () => import('./views/kioskView.vue')
const LoginView = () => import('./views/loginView.vue')
const AdminView = () => import('./views/adminView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',       component: Launcher  },
    { path: '/login',  component: LoginView },
    { path: '/foh',    component: FohView },
    { path: '/agent',  component: AgentView, meta: { requiresAuth: true } },
    { path: '/admin',  component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/kiosk',  component: KioskView },  // public — no auth required
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.user)
    return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.requiresAdmin) {
    // Profile is fetched asynchronously after the auth session is restored.
    // On a hard refresh the guard may run before fetchProfile() has resolved,
    // so auth.profile is null even though the user is an admin.  Wait for it.
    if (auth.user && !auth.profile) {
      try { await auth.fetchProfile() } catch {}
    }
    if (auth.profile?.rol !== 'admin') return '/agent'
  }
})

export default router
