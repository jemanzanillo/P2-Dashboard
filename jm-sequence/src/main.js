import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import { useAuthStore } from '@/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

const auth = useAuthStore()
await auth.init()   // restores session before first render

app.mount('#app')

