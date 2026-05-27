<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQueueStore }  from '@/queue.js'
import { useAuthStore }   from '@/auth'
import { useLocaleStore } from '@/locale.js'
import {
  fetchAllProfiles, updateProfile,
  fetchConfigSistema, updateConfigItem,
  updateVentanilla, assignServicesToCounter,
} from '@/lib/db.js'

const store  = useQueueStore()
const auth   = useAuthStore()
const router = useRouter()
const locale = useLocaleStore()

const activeSection = ref('overview')

const NAV_ITEMS = [
  { id: 'overview', label: 'admin.nav.overview' },
  { id: 'counters', label: 'admin.nav.counters'  },
  { id: 'agents',   label: 'admin.nav.agents'    },
  { id: 'config',   label: 'admin.nav.config'    },
]

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  // App.vue's auth watcher already triggers store.init(); this is a fallback.
  await store.init()

  if (store.error && !store.initialized) {
    console.error('[adminView] Queue init failed — authentication error:', store.error)
    router.push('/login?reason=auth_failed')
    return
  }

  await loadAdminData()
})
// Don't tear down the queue store on view unmount — App.vue owns its lifetime
// via the auth.user watcher (cleanup runs on SIGNED_OUT).
onUnmounted(() => {})

// ── Admin data ─────────────────────────────────────────────────────────────────
const profiles    = ref([])
const configItems = ref([])
const configSaved = ref({})

async function loadAdminData() {
  const [profs, config] = await Promise.all([fetchAllProfiles(), fetchConfigSistema()])
  profiles.value    = profs
  configItems.value = config.map(r => ({ ...r, draft: r.valor }))
  configSaved.value = Object.fromEntries(config.map(r => [r.clave, 'idle']))
}

// ── Stats (hospital-wide from all turns) ──────────────────────────────────────
const todayISO = new Date().toISOString().slice(0, 10)

const adminStats = computed(() => ({
  waiting:  store.turns.filter(t => ['waiting', 'deferred'].includes(t.status)).length,
  attended: store.turns.filter(t => t.status === 'attended' && t.createdAt?.startsWith(todayISO)).length,
  noshow:   store.turns.filter(t => t.status === 'skipped'  && t.createdAt?.startsWith(todayISO)).length,
}))

const activeCountersCount = computed(() =>
  store.counters.filter(c => c.status === 'active').length
)

// ── Config labels ─────────────────────────────────────────────────────────────
const CONFIG_LABELS = {
  hora_operacion_fin:       'Hora de cierre',
  hora_operacion_inicio:    'Hora de apertura',
  impresora_ancho:          'Ancho de impresora',
  impresora_copias:         'Copias por turno',
  kiosk_requerir_cedula:    'Requerir cédula en kiosk',
  kiosk_tiempo_inactividad: 'Tiempo inactividad kiosk (seg)',
  maximo_turnos_diarios:    'Máximo de turnos diarios',
  mostrar_tiempo_estimado:  'Mostrar tiempo estimado',
  nombre_hospital:          'Nombre del hospital',
}

async function saveConfigItem(item) {
  configSaved.value[item.clave] = 'saving'
  try {
    await updateConfigItem({ clave: item.clave, valor: item.draft })
    item.valor = item.draft
    configSaved.value[item.clave] = 'saved'
    setTimeout(() => { configSaved.value[item.clave] = 'idle' }, 2000)
  } catch {
    configSaved.value[item.clave] = 'idle'
  }
}

// ── Counter edit modal ─────────────────────────────────────────────────────────
const editCounterModal = ref(false)
const editingCounter   = ref(null)
const counterSaving    = ref(false)
const counterForm      = ref({ etiqueta: '', esPrioritaria: false, serviceIds: [] })

function openEditCounter(counter) {
  editingCounter.value = counter
  counterForm.value = {
    etiqueta:      counter.label,
    esPrioritaria: counter.esPrioritaria,
    serviceIds:    [...counter.serviceIDs],
  }
  editCounterModal.value = true
}

function toggleService(serviceId) {
  const idx = counterForm.value.serviceIds.indexOf(serviceId)
  if (idx >= 0) counterForm.value.serviceIds.splice(idx, 1)
  else counterForm.value.serviceIds.push(serviceId)
}

async function saveCounter() {
  counterSaving.value = true
  try {
    const c = editingCounter.value
    await updateVentanilla({
      id:            c.id,
      etiqueta:      counterForm.value.etiqueta,
      estado:        c.status === 'active' ? 'activa' : 'inactiva',
      esPrioritaria: counterForm.value.esPrioritaria,
    })
    await assignServicesToCounter({
      ventanillaId: c.id,
      serviceIds:   counterForm.value.serviceIds,
    })
    editCounterModal.value = false
  } catch (e) {
    console.error(e)
  } finally {
    counterSaving.value = false
  }
}

async function toggleCounterStatus(counter) {
  await updateVentanilla({
    id:            counter.id,
    etiqueta:      counter.label,
    estado:        counter.status === 'active' ? 'inactiva' : 'activa',
    esPrioritaria: counter.esPrioritaria,
  })
}

// ── Agent assign modal ─────────────────────────────────────────────────────────
const assignAgentModal = ref(false)
const assigningProfile = ref(null)
const assignSaving     = ref(false)
const assignForm       = ref({ ventanillaId: '' })

function openAssignAgent(profile) {
  assigningProfile.value = profile
  assignForm.value = { ventanillaId: profile.ventanilla_id ?? '' }
  assignAgentModal.value = true
}

async function saveAgentAssignment() {
  assignSaving.value = true
  try {
    await updateProfile({
      id:           assigningProfile.value.id,
      ventanillaId: assignForm.value.ventanillaId || null,
    })
    await loadAdminData()
    assignAgentModal.value = false
  } catch (e) {
    console.error(e)
  } finally {
    assignSaving.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function counterLabel(ventanillaId) {
  if (!ventanillaId) return null
  const c = store.counters.find(c => c.id === ventanillaId)
  return c ? `#${c.numero} ${c.label}` : `#${ventanillaId}`
}

function agentForCounter(counterId) {
  return profiles.value.find(p => p.ventanilla_id === counterId)?.nombre ?? null
}

function serviceName(serviceId) {
  return store.services.find(s => s.id === serviceId)?.nombre_corto ?? '?'
}

const userInitial = computed(() =>
  (auth.profile?.nombre ?? 'A').charAt(0).toUpperCase()
)

async function logout() {
  // App.vue's auth.user watcher calls store.cleanup() on SIGNED_OUT.
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin-layout">

    <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
    <aside class="admin-sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">
          <span class="brand-letter">JM</span>
        </div>
        <div>
          <div class="brand-title">JM Sequence</div>
          <div class="brand-subtitle">Administración</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="item in NAV_ITEMS" :key="item.id"
          :class="['nav-item', { 'nav-item--active': activeSection === item.id }]"
          @click="activeSection = item.id"
        >
          {{ locale.t(item.label) }}
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="user-row">
          <div class="user-avatar">{{ userInitial }}</div>
          <div class="user-info">
            <span class="user-name">{{ auth.profile?.nombre ?? 'Admin' }}</span>
            <span class="user-role">Administrador</span>
          </div>
        </div>
        <button class="logout-btn" @click="logout">
          {{ locale.t('common.logout') }}
        </button>
      </div>
    </aside>

    <!-- ── Main content ────────────────────────────────────────────────────── -->
    <main class="admin-main">

      <!-- ── Resumen ──────────────────────────────────────────────────────── -->
      <section v-if="activeSection === 'overview'" class="section">
        <h1 class="section-title">{{ locale.t('admin.overview.title') }}</h1>

        <div class="stat-grid">
          <div class="stat-card">
            <span class="stat-value">{{ activeCountersCount }}</span>
            <span class="stat-label">{{ locale.t('admin.overview.activeCounters') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value stat-value--blue">{{ adminStats.waiting }}</span>
            <span class="stat-label">{{ locale.t('admin.overview.waiting') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value stat-value--green">{{ adminStats.attended }}</span>
            <span class="stat-label">{{ locale.t('admin.overview.attended') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value stat-value--amber">{{ adminStats.noshow }}</span>
            <span class="stat-label">{{ locale.t('admin.overview.noshow') }}</span>
          </div>
        </div>

        <h2 class="subsection-title">{{ locale.t('admin.overview.counterStatus') }}</h2>
        <div class="overview-counter-list">
          <div v-for="c in store.counters" :key="c.id" class="overview-counter-row">
            <div class="ocr-num">#{{ c.numero }}</div>
            <div class="ocr-label">{{ c.label }}</div>
            <span :class="['badge', c.status === 'active' ? 'badge--green' : 'badge--gray']">
              {{ c.status === 'active' ? locale.t('admin.counters.active') : locale.t('admin.counters.inactive') }}
            </span>
            <div class="ocr-agent">
              {{ agentForCounter(c.id) ?? locale.t('admin.overview.noAgent') }}
            </div>
          </div>
        </div>
      </section>

      <!-- ── Ventanillas ──────────────────────────────────────────────────── -->
      <section v-else-if="activeSection === 'counters'" class="section">
        <h1 class="section-title">{{ locale.t('admin.counters.title') }}</h1>

        <div class="counter-grid">
          <div v-for="c in store.counters" :key="c.id" class="counter-card">
            <div class="cc-top">
              <div class="cc-number">#{{ c.numero }}</div>
              <div class="cc-badges">
                <span :class="['badge', c.status === 'active' ? 'badge--green' : 'badge--gray']">
                  {{ c.status === 'active' ? locale.t('admin.counters.active') : locale.t('admin.counters.inactive') }}
                </span>
                <span v-if="c.esPrioritaria" class="badge badge--amber">
                  {{ locale.t('admin.counters.priority') }}
                </span>
              </div>
            </div>

            <p class="cc-label">{{ c.label }}</p>

            <div class="cc-services">
              <template v-if="c.serviceIDs.length">
                <span v-for="sid in c.serviceIDs" :key="sid" class="service-chip">
                  {{ serviceName(sid) }}
                </span>
              </template>
              <span v-else class="no-services-text">{{ locale.t('admin.counters.noServices') }}</span>
            </div>

            <div class="cc-actions">
              <button
                :class="['btn-sm', c.status === 'active' ? 'btn-secondary' : 'btn-outline-green']"
                @click="toggleCounterStatus(c)"
              >
                {{ c.status === 'active' ? locale.t('admin.counters.deactivate') : locale.t('admin.counters.activate') }}
              </button>
              <button class="btn-sm btn-primary" @click="openEditCounter(c)">
                {{ locale.t('admin.counters.edit') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Agentes ──────────────────────────────────────────────────────── -->
      <section v-else-if="activeSection === 'agents'" class="section">
        <h1 class="section-title">{{ locale.t('admin.agents.title') }}</h1>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ locale.t('admin.agents.name') }}</th>
                <th>{{ locale.t('admin.agents.counter') }}</th>
                <th>{{ locale.t('admin.agents.role') }}</th>
                <th>{{ locale.t('admin.agents.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in profiles" :key="p.id">
                <td class="td-name">{{ p.nombre }}</td>
                <td>
                  <span v-if="p.ventanilla_id" class="badge badge--blue">
                    {{ counterLabel(p.ventanilla_id) }}
                  </span>
                  <span v-else class="badge badge--gray">{{ locale.t('admin.agents.unassigned') }}</span>
                </td>
                <td class="td-role">{{ p.rol }}</td>
                <td>
                  <button class="btn-sm btn-secondary" style="flex: none; width: auto" @click="openAssignAgent(p)">
                    {{ locale.t('admin.agents.assign') }}
                  </button>
                </td>
              </tr>
              <tr v-if="profiles.length === 0">
                <td colspan="4" class="td-empty">Sin agentes registrados</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Configuración ────────────────────────────────────────────────── -->
      <section v-else-if="activeSection === 'config'" class="section">
        <h1 class="section-title">{{ locale.t('admin.config.title') }}</h1>

        <div class="table-wrap">
          <table class="data-table config-table">
            <thead>
              <tr>
                <th>{{ locale.t('admin.config.key') }}</th>
                <th>{{ locale.t('admin.config.value') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in configItems" :key="item.clave">
                <td class="td-config-key">{{ CONFIG_LABELS[item.clave] ?? item.clave }}</td>
                <td>
                  <input
                    v-model="item.draft"
                    class="config-input"
                    @keydown.enter="saveConfigItem(item)"
                  />
                </td>
                <td class="td-save">
                  <button
                    :class="['btn-save', { 'btn-save--saved': configSaved[item.clave] === 'saved' }]"
                    :disabled="configSaved[item.clave] === 'saving'"
                    @click="saveConfigItem(item)"
                  >
                    {{
                      configSaved[item.clave] === 'saved'  ? locale.t('admin.config.saved')  :
                      configSaved[item.clave] === 'saving' ? locale.t('admin.config.saving') :
                      locale.t('admin.config.save')
                    }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </main>

    <!-- ── Edit Counter Modal ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="editCounterModal" class="modal-overlay" @click.self="editCounterModal = false">
        <div class="modal" role="dialog" aria-modal="true">
          <h2 class="modal-title">{{ locale.t('admin.counters.editTitle') }}</h2>

          <div class="form-group">
            <label class="form-label">{{ locale.t('admin.counters.labelField') }}</label>
            <input v-model="counterForm.etiqueta" class="form-input" />
          </div>

          <label class="form-check">
            <input type="checkbox" v-model="counterForm.esPrioritaria" class="check-input" />
            <span>{{ locale.t('admin.counters.isPriority') }}</span>
          </label>

          <div class="form-group" style="margin-top: 20px">
            <p class="form-label">{{ locale.t('admin.counters.assignServices') }}</p>
            <div class="service-check-grid">
              <label v-for="s in store.services" :key="s.id" class="service-check-item">
                <input
                  type="checkbox"
                  :checked="counterForm.serviceIds.includes(s.id)"
                  @change="toggleService(s.id)"
                  class="check-input"
                />
                <span>{{ s.nombre }}</span>
              </label>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-modal-cancel" @click="editCounterModal = false">
              {{ locale.t('common.cancel') }}
            </button>
            <button class="btn-modal-primary" :disabled="counterSaving" @click="saveCounter">
              {{ counterSaving ? locale.t('admin.counters.saving') : locale.t('admin.counters.save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Assign Agent Modal ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="assignAgentModal" class="modal-overlay" @click.self="assignAgentModal = false">
        <div class="modal" role="dialog" aria-modal="true">
          <h2 class="modal-title">{{ locale.t('admin.agents.assignTitle') }}</h2>
          <p class="modal-sub">{{ assigningProfile?.nombre }}</p>

          <div class="form-group">
            <label class="form-label">{{ locale.t('admin.agents.counter') }}</label>
            <select v-model="assignForm.ventanillaId" class="form-input">
              <option value="">{{ locale.t('admin.agents.noCounter') }}</option>
              <option v-for="c in store.counters" :key="c.id" :value="c.id">
                #{{ c.numero }} — {{ c.label }}
              </option>
            </select>
          </div>

          <div class="modal-actions">
            <button class="btn-modal-cancel" @click="assignAgentModal = false">
              {{ locale.t('common.cancel') }}
            </button>
            <button class="btn-modal-primary" :disabled="assignSaving" @click="saveAgentAssignment">
              {{ assignSaving ? locale.t('admin.agents.saving') : locale.t('admin.agents.save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Figtree:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Layout ───────────────────────────────────────────────────────────────── */
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  font-family: 'Figtree', sans-serif;
  background: #EEF1F6;
  color: #111827;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid rgba(0, 0, 0, 0.07);
  height: 100vh;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  flex-shrink: 0;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #1A72FF;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-letter {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  letter-spacing: 0.03em;
}

.brand-title {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: #111827;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: none;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #4B5563;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  width: 100%;
}

.nav-item:hover {
  background: #F3F4F6;
  color: #111827;
}

.nav-item--active {
  background: #EFF4FF;
  color: #1A72FF;
  font-weight: 600;
  box-shadow: inset 3px 0 0 #1A72FF;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.07);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1A72FF;
  color: #fff;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  color: #9CA3AF;
}

.logout-btn {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 7px;
  background: none;
  font-family: 'Figtree', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  text-align: center;
}

.logout-btn:hover {
  background: #FEE2E2;
  color: #DC2626;
  border-color: #FECACA;
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
.admin-main {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  min-width: 0;
}

.section-title {
  font-family: 'Syne', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 24px;
}

.subsection-title {
  font-family: 'Syne', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 32px;
  margin-bottom: 12px;
}

/* ── Badges ───────────────────────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.badge--green { background: #D1FAE5; color: #065F46; }
.badge--gray  { background: #F3F4F6; color: #6B7280; }
.badge--blue  { background: #DBEAFE; color: #1E40AF; }
.badge--amber { background: #FEF3C7; color: #92400E; }

/* ── Stat grid ────────────────────────────────────────────────────────────── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 8px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-value {
  font-family: 'Syne', sans-serif;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  color: #111827;
}

.stat-value--blue  { color: #1A72FF; }
.stat-value--green { color: #10B981; }
.stat-value--amber { color: #F0A429; }

.stat-label {
  font-size: 13px;
  color: #6B7280;
  font-weight: 500;
}

/* ── Overview counter list ────────────────────────────────────────────────── */
.overview-counter-list {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.overview-counter-row {
  display: grid;
  grid-template-columns: 44px 1fr 96px 1fr;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.overview-counter-row:last-child { border-bottom: none; }

.ocr-num {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: #111827;
}

.ocr-label {
  font-size: 14px;
  color: #374151;
  font-weight: 500;
}

.ocr-agent {
  font-size: 13px;
  color: #6B7280;
}

/* ── Counter grid ─────────────────────────────────────────────────────────── */
.counter-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.counter-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cc-number {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 20px;
  color: #111827;
}

.cc-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cc-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.cc-services {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}

.service-chip {
  padding: 3px 8px;
  background: #EFF4FF;
  color: #1E40AF;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.no-services-text {
  font-size: 12px;
  color: #9CA3AF;
  font-style: italic;
  align-self: center;
}

.cc-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* ── Shared buttons ───────────────────────────────────────────────────────── */
.btn-sm {
  padding: 7px 14px;
  border-radius: 7px;
  font-family: 'Figtree', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: filter 0.12s, opacity 0.12s;
  flex: 1;
}

.btn-sm:hover:not(:disabled) { filter: brightness(1.06); }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary     { background: #1A72FF; color: #fff; border: none; }
.btn-secondary   { background: #F3F4F6; color: #374151; border: none; }
.btn-outline-green {
  background: #ECFDF5;
  color: #065F46;
  border: 1px solid #A7F3D0;
}

/* ── Table ────────────────────────────────────────────────────────────────── */
.table-wrap {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 12px 20px;
  font-size: 11px;
  font-weight: 700;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: #F9FAFB;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
}

.data-table td {
  padding: 13px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  color: #374151;
  vertical-align: middle;
}

.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover { background: #FAFAFA; }

.td-name  { font-weight: 600; color: #111827; }
.td-role  { color: #6B7280; font-size: 13px; text-transform: capitalize; }
.td-empty { text-align: center; color: #9CA3AF; padding: 40px 20px; }

/* ── Config table ─────────────────────────────────────────────────────────── */
.td-config-key {
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  width: 260px;
}

.config-input {
  width: 100%;
  max-width: 340px;
  padding: 7px 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  color: #111827;
  background: #fff;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.config-input:focus {
  outline: none;
  border-color: #1A72FF;
  box-shadow: 0 0 0 3px rgba(26, 114, 255, 0.1);
}

.td-save { width: 108px; }

.btn-save {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-family: 'Figtree', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
  width: 100%;
}

.btn-save:hover:not(:disabled) {
  background: #1A72FF;
  color: #fff;
  border-color: #1A72FF;
}

.btn-save--saved {
  background: #ECFDF5 !important;
  color: #065F46 !important;
  border-color: #A7F3D0 !important;
}

.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Modals ───────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(2px);
}

.modal {
  background: #fff;
  border-radius: 16px;
  padding: 28px 32px;
  width: 440px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-title {
  font-family: 'Syne', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.modal-sub {
  font-size: 14px;
  color: #6B7280;
  margin-bottom: 20px;
}

.form-group { margin-bottom: 16px; }

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  color: #111827;
  background: #fff;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.form-input:focus {
  outline: none;
  border-color: #1A72FF;
  box-shadow: 0 0 0 3px rgba(26, 114, 255, 0.1);
}

.form-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}

.check-input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #1A72FF;
  flex-shrink: 0;
}

.service-check-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.service-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  transition: background 0.1s, border-color 0.1s;
  user-select: none;
}

.service-check-item:hover { background: #F9FAFB; }

.service-check-item:has(input:checked) {
  background: #EFF4FF;
  border-color: #BFDBFE;
  color: #1E40AF;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.btn-modal-cancel {
  padding: 9px 20px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: none;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-modal-cancel:hover { background: #F3F4F6; }

.btn-modal-primary {
  padding: 9px 20px;
  border-radius: 8px;
  border: none;
  background: #1A72FF;
  font-family: 'Figtree', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: filter 0.12s;
}

.btn-modal-primary:hover:not(:disabled) { filter: brightness(1.08); }
.btn-modal-primary:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
