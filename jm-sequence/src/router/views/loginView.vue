<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="logo-mark">JM</div>
        <div class="brand-text">
          <span class="brand-name">JM Sequence</span>
          <span class="brand-sub">{{ locale.t('login.queueSystem') }}</span>
        </div>
      </div>

      <h1 class="heading">{{ locale.t('login.heading') }}</h1>

      <form class="form" @submit.prevent="handleSubmit">
        <div class="field">
          <label for="email">{{ locale.t('login.email') }}</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="usuario@hospital.do"
            required
            :disabled="loading"
          />
        </div>

        <div class="field">
          <label for="password">{{ locale.t('login.password') }}</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
            :disabled="loading"
          />
        </div>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <button type="submit" class="btn-submit" :disabled="loading">
          <span v-if="loading" class="spinner" />
          <span>{{ loading ? locale.t('login.verifying') : locale.t('login.submit') }}</span>
        </button>
      </form>

      <p class="footer-note">
        Hospital Docente Universitario Traumatológico<br>Dr. Darío Contreras
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/auth'
import { useLocaleStore } from '@/locale.js'

const router  = useRouter()
const auth    = useAuthStore()
const locale  = useLocaleStore()

const email    = ref('')
const password = ref('')
const loading  = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  errorMsg.value = ''
  loading.value  = true
  try {
    await auth.login(email.value, password.value)
    const dest = auth.profile?.rol === 'admin' ? '/admin' : '/agent'
    router.push(dest)
  } catch (e) {
    errorMsg.value = locale.t('login.error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #07101E;
  font-family: 'Figtree', sans-serif;
  padding: 24px;
}

.login-card {
  background: #111C2E;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 16px;
  padding: 48px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-mark {
  width: 44px;
  height: 44px;
  background: #1A72FF;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.brand-name {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 18px;
  color: #EEF3FF;
  line-height: 1;
}

.brand-sub {
  font-size: 12px;
  color: rgba(238, 243, 255, 0.50);
  line-height: 1;
}

/* Heading */
.heading {
  font-family: 'Syne', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #EEF3FF;
  margin: 0;
  line-height: 1.2;
}

/* Form */
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(238, 243, 255, 0.70);
  letter-spacing: 0.01em;
}

input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: 'Figtree', sans-serif;
  font-size: 15px;
  color: #EEF3FF;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

input::placeholder {
  color: rgba(238, 243, 255, 0.25);
}

input:focus {
  border-color: #1A72FF;
  background: rgba(26, 114, 255, 0.06);
}

input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-msg {
  margin: 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.30);
  border-radius: 8px;
  font-size: 13px;
  color: #FCA5A5;
  line-height: 1.4;
}

.btn-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #1A72FF;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 14px;
  font-family: 'Figtree', sans-serif;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  margin-top: 4px;
}

.btn-submit:hover:not(:disabled) {
  background: #1560d4;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Spinner */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.30);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Footer */
.footer-note {
  margin: 0;
  font-size: 11px;
  color: rgba(238, 243, 255, 0.30);
  text-align: center;
  line-height: 1.6;
}
</style>
