import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/auth'
import Launcher from './Launcher.vue'

const FohView   = () => import('./views/fohView.vue')
const AgentView = () => import('./views/agentView.vue')
const KioskView = () => import('./views/kioskView.vue')
const LoginView = () => import('./views/loginView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',       component: Launcher  },
    { path: '/login',  component: LoginView },
    { path: '/foh',    component: FohView,   meta: { requiresAuth: true } },
    { path: '/agent',  component: AgentView, meta: { requiresAuth: true } },
    { path: '/kiosk',  component: KioskView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.user) return '/login'
  if (to.meta.requiresAdmin && auth.profile?.rol !== 'admin') return '/agent'
})

export default router
