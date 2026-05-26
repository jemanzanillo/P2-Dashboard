import { defineStore } from 'pinia'
import es from './locales/es.js'
import en from './locales/en.js'

const LOCALES = { es, en }

export const useLocaleStore = defineStore('locale', {
  state: () => ({
    lang: localStorage.getItem('jm-lang') ?? 'es',
  }),
  getters: {
    t: (state) => (key) => LOCALES[state.lang]?.[key] ?? key,
  },
  actions: {
    setLang(lang) {
      this.lang = lang
      localStorage.setItem('jm-lang', lang)
    },
  },
})
