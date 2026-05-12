import { createRouter, createWebHistory } from 'vue-router'
import Launcher from './Launcher.vue'

const FohView   = () => import('./views/fohView.vue')
const AgentView = () => import('./views/agentView.vue')

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',       component: Launcher  },
    { path: '/foh',    component: FohView    },
    { path: '/agent',  component: AgentView  },
  ],
})