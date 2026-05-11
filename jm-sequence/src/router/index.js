import { createRouter, createWebHistory } from 'vue-router'
import KioskView from '../views/KioskView.vue'
import AgentView from '../views/AgentView.vue'
import BohView   from '../views/BohView.vue'
import FohView   from '../views/FohView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',       redirect: '/foh' },
    { path: '/kiosk',  component: KioskView },
    { path: '/agent',  component: AgentView },
    { path: '/boh',    component: BohView   },
    { path: '/foh',    component: FohView   }, // ← NUEVA RUTA
  ]
})