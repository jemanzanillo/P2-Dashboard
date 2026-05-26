# Panel de Administrador — Funciones y Data Requerida
> Actualizado al estado real del codebase y la base de datos (2026-05-26).
> Notación: ✅ campo/función ya existe en DB · ⚠️ necesita ser añadido a DB · 🔨 UI no construida aún

---

## 🟦 1. Dashboard — Vista General Operacional

Métricas derivadas del store `queue.js` + Supabase. El store ya expone `stats` con conteos globales; se necesita desglose por servicio/ventanilla.

**Métricas disponibles en el store hoy (`stats` computed):**
- ✅ Turnos en espera — `stats.waiting` (global, incluye `espera` + `diferido`)
- ✅ Turnos llamados hoy — `stats.called`
- ✅ Turnos finalizados hoy — `stats.attended`
- ✅ No-shows del día — `stats.skipped`

**Métricas adicionales requeridas (se calculan con queries a `turnos`):**
- 🔨 Desglose de espera por servicio (`servicio_id` + `estado='espera'`)
- 🔨 Ventanillas activas vs. inactivas (`ventanillas.estado`)
- 🔨 Tiempo promedio de espera — `AVG(tiempo_espera_segundos)` por servicio
- 🔨 Tiempo promedio de atención — `AVG(tiempo_atencion_segundos)` por ventanilla y servicio
- 🔨 Tasa de no-show — `COUNT(noshow) / COUNT(*)` del día

**Gráficas (requieren `chart.js` + `vue-chartjs` — aún no instalados):**
- 🔨 Turnos por hora (agrupar `created_at` en franjas de 1h)
- 🔨 Tiempo promedio por franja horaria

---

## 🟩 2. Gestión de Servicios

Tabla: `servicios`. CRUD completo por el admin.

**Campos existentes en DB:**
| Campo DB | Descripción UI | Estado |
|---|---|---|
| `nombre` | Nombre completo del servicio | ✅ |
| `nombre_corto` | Abreviación (ej. "Lab", "Adm") | ✅ |
| `prefijo_turno` | Letra del turno (ej. "L", "A") | ✅ |
| `color_token` | Color de identificación visual | ✅ |
| `icono_codigo` | Código del ícono (ya en DB, UI pendiente) | ✅ |
| `orden_kiosk` | Orden de aparición en el kiosk | ✅ |
| `estado` | `activo` / `inactivo` | ✅ |
| `acepta_especiales` | Toggle para prioridad especial | ✅ |
| `hora_apertura` | Hora de inicio del servicio (ej. `08:00`) | ✅ |
| `hora_cierre_recepcion` | Última hora para recibir turnos (ej. `17:30`) | ✅ |

**Campo faltante en DB:**
| Campo | Descripción | Estado |
|---|---|---|
| `tiempo_estimado_atencion` | Minutos estimados por atención (para cálculo de espera al paciente) | ⚠️ |

**Servicios actuales (6 filas):** Laboratorio (L) · Admisión (A) · Cura (C) · Farmacia (F) · Radiología (R) · Especial (E)

**Acciones UI requeridas:** Crear · Editar · Desactivar temporalmente · Reordenar (drag & drop `orden_kiosk`)

> `fetchServices()` en `db.js` ya carga id, nombre, nombre_corto, prefijo_turno, color_token, icono_codigo, orden_kiosk — falta añadir `estado`, `acepta_especiales`, `hora_apertura`, `hora_cierre_recepcion` al select para el panel admin.

---

## 🟧 3. Gestión de Ventanillas

Tabla: `ventanillas`. Join con servicios: `ventanilla_servicios`.

**Campos existentes en DB:**
| Campo DB | Descripción UI | Estado |
|---|---|---|
| `id` | ID entero (1–8), NO uuid | ✅ |
| `numero` | Número de ventanilla | ✅ |
| `etiqueta` | Label visible (ej. "Ventanilla 1") | ✅ |
| `estado` | `activa` / `inactiva` | ✅ |
| `agente_id` | UUID del agente asignado (FK a `auth.users`) | ✅ |
| `es_prioritaria` | Flag: ventanilla reservada para pacientes especiales | ✅ |
| `ventanilla_servicios` | Join table: qué servicios atiende esta ventanilla | ✅ (tabla vacía hoy) |

**Estado actual:** 8 ventanillas (IDs 1–8). Ventanillas 1–2 activas, 3–8 inactivas. `ventanilla_servicios` está vacía — bloquea el algoritmo de prioridad.

**Acciones UI requeridas:**
- Ver lista de ventanillas con estado y agente asignado
- Selector múltiple de servicios (popula `ventanilla_servicios`)
- Toggle activa/inactiva
- Editar etiqueta
- Crear/eliminar ventanilla
- Ver si `es_prioritaria` está activo

> Este es el mecanismo core: admin asigna servicios a ventanilla → agente hereda la config automáticamente al login.

---

## 🟨 4. Gestión de Usuarios

Tabla principal: `profiles` (vinculada a `auth.users` de Supabase Auth). **No usar la tabla `usuarios` — es vestigial y no está ligada a Auth.**

**Campos existentes en `profiles`:**
| Campo DB | Descripción | Estado |
|---|---|---|
| `id` | UUID = `auth.users.id` | ✅ |
| `nombre` | Nombre del agente/admin | ✅ |
| `rol` | `agente` \| `admin` | ✅ |
| `ventanilla_id` | Ventanilla asignada (FK a `ventanillas.id`) | ✅ |

**Campos faltantes en `profiles`:**
| Campo | Descripción | Estado |
|---|---|---|
| `estado` | `activo` / `inactivo` (para desactivar sin borrar) | ⚠️ |
| `ultima_sesion` | Timestamp de último login (disponible en `auth.users.last_sign_in_at`) | ⚠️ |

**Acciones UI requeridas:**
- Lista de todos los usuarios con nombre, rol, ventanilla asignada, estado, última sesión
- **Crear usuario:** llama `supabase.auth.admin.createUser()` desde Edge Function (la API Admin no se puede llamar desde el frontend con la anon key)
- **Editar:** nombre, rol, ventanilla asignada
- **Desactivar cuenta:** setear `estado = 'inactivo'` (no eliminar — auditoría)
- **Resetear contraseña:** `supabase.auth.admin.updateUserById()` desde Edge Function

> Perfiles actuales: 2 agentes, sin ventanilla asignada. El admin `admin@jmsequence.do` está en la tabla `usuarios` vestigial — necesita una entrada real en `auth.users` + `profiles`.

---

## 🟪 5. Cola en Tiempo Real — Vista Completa del Admin

El store `queue.js` ya carga todos los turnos (`turns[]`) con Realtime. El admin ve la misma data que el agente pero con más acciones.

**Campos de turno disponibles (via `mapTurnRow` en `db.js`):**
- ✅ `id` (numero), `dbId` (uuid), `serviceLabel`, `servicePrefijo`
- ✅ `priority` (`special` / `normal`), `status` (6 estados)
- ✅ `patientName`, `idNumber`
- ✅ `callCount`, `callLog[]`, `calledAt`, `createdAt`
- ✅ `specialCondition`, `reinstated`, `noShowOccurred`
- ✅ `counterId`, `durationMs`

**Acciones ya implementadas en `db.js` + `queue.js`:**
| Acción | Función DB | Estado |
|---|---|---|
| Llamar turno manualmente | `callTurn()` | ✅ |
| Anular turno | `cancelTurn({ dbId, motivo })` | ✅ |
| Reinsertar no-show | `reinstateTurn()` | ✅ |
| Transferir a otra ventanilla | `transferTurn({ dbId, newVentanillaId })` | ✅ |
| Suspender / diferir | `suspendTurn()` | ✅ |

**UI del admin requerida:**
- 🔨 Tabla paginada con todos los turnos del día
- 🔨 Filtros por: servicio, ventanilla, prioridad, estado, franja horaria
- 🔨 Detalle expandible por turno: condición especial, tiempo en espera, quién lo atendió, call_log
- 🔨 Botones de acción (llamar override, anular con motivo, reinsertar, transferir)

---

## ⬛ 6. Contenido del FOH

Tabla: `contenido_foh`. Controla el ticker y los videos de la pantalla pública.

**Estado actual de la tabla (schema completo confirmado):**
- 2 filas con `tipo = 'aviso'` (texto del ticker)
- Esquema listo para videos — solo falta insertar filas con `tipo = 'video'`

**Campos disponibles:**

| Campo | Aplica a | Estado |
|---|---|---|
| `tipo` (`'aviso'` \| `'video'`) | ambos | ✅ |
| `nombre` (identificador interno) | ambos | ✅ |
| `contenido` (texto del aviso) | aviso | ✅ |
| `url` (URL del video) | video | ✅ |
| `activo` (boolean, default true) | ambos | ✅ |
| `orden` (integer, default 0) | ambos | ✅ |
| `fecha_inicio` / `fecha_fin` (scheduling por fecha) | ambos | ✅ |

**Acciones UI requeridas:** CRUD de avisos · CRUD de videos · Toggle activo/inactivo · Reordenar

---

## 🔐 7. Configuración General del Sistema

Tabla: `config_sistema` — estructura key-value (`clave`, `valor`).

**Claves existentes (9 filas confirmadas):**
| clave | valor actual | Editable en UI |
|---|---|---|
| `nombre_hospital` | Hospital Dr. Darío Contreras | ✅ |
| `hora_operacion_inicio` | `07:00` | ✅ |
| `hora_operacion_fin` | `18:00` | ✅ |
| `kiosk_tiempo_inactividad` | `120` (segundos) | ✅ |
| `kiosk_requerir_cedula` | `false` | ✅ |
| `maximo_turnos_diarios` | `300` | ✅ |
| `impresora_ancho` | `80mm` | ✅ |
| `impresora_copias` | `1` | ✅ |
| `mostrar_tiempo_estimado` | `true` | ✅ |

**Claves faltantes (añadir como nuevas filas):**
| clave | Descripción | Estado |
|---|---|---|
| `logo_url` | URL del logo del hospital | ⚠️ |
| `footer_ticket` | Texto del pie del ticket impreso | ⚠️ |
| `mensaje_bienvenida_kiosk` | Texto de bienvenida en pantalla de inicio del kiosk | ⚠️ |
| `tiempo_preregistro_minutos` | Cuántos minutos antes de `hora_apertura` se pueden crear turnos | ⚠️ |

**Condiciones especiales (tabla propia `condiciones_especiales`):**

Las 4 condiciones activas son editables por el admin. Campos: `nombre`, `icono`, `orden`, `activa`.
- ✅ `fetchConditions()` en `db.js` ya filtra por `activa = true`
- 🔨 UI para crear/editar/desactivar condiciones

---

## 📊 8. Auditoría y Reportes

**Sin tabla de auditoría en DB actualmente.** El sistema registra acciones implícitamente a través de los campos de `turnos` (`call_log`, `motivo_anulacion`, `reinstated`, timestamps), pero no hay un log centralizado.

**Tabla a crear:** `audit_log`
| Campo | Descripción |
|---|---|
| `id` | UUID |
| `actor_id` | FK a `profiles.id` |
| `accion` | Tipo de acción (string enum) |
| `tabla_afectada` | Nombre de la tabla |
| `registro_id` | UUID del registro afectado |
| `detalle` | JSON con cambios (before/after) |
| `created_at` | Timestamp |

> Implementar como INSERT-only desde triggers de Supabase o desde las funciones de `db.js` — nunca UPDATE/DELETE en `audit_log`.

**Reportes requeridos:**
- 🔨 Exportar día actual en CSV (turnos, tiempos, agentes)
- 🔨 Reporte de no-shows por servicio y por fecha
- 🔨 Historial de cambios de configuración de ventanillas

---

## 🔔 9. Notificaciones de Ayuda en Kiosk

**Sin tabla en DB actualmente.**

**Tabla a crear:** `kiosk_ayudas`
| Campo | Descripción |
|---|---|
| `id` | UUID |
| `kiosk_id` | Identificador del kiosk físico |
| `estado` | `pendiente` / `atendida` |
| `admin_id` | FK a `profiles.id` (quien atendió) |
| `tiempo_respuesta_segundos` | Para SLA |
| `created_at` | Timestamp |

**Flujo:** Kiosk presiona "¿Necesitas ayuda?" → INSERT en `kiosk_ayudas` → Realtime notifica al admin → Admin marca como atendida → Kiosk recibe confirmación.

> Requiere ampliar `subscribeToChanges()` en `db.js` para escuchar la tabla `kiosk_ayudas`.

---

## 🕐 10. Horarios Inteligentes con Preregistro

**Ya existe en la tabla `servicios`:** `hora_apertura` y `hora_cierre_recepcion` por servicio.

**Falta en `config_sistema`:** `tiempo_preregistro_minutos` (actualmente 60 min por diseño, pero no es configurable).

**Lógica requerida en kiosk/admin:**
- Bloquear inserción de turno si `NOW() > hora_cierre_recepcion`
- Permitir turno si `NOW() >= hora_apertura - tiempo_preregistro_minutos`
- Turno creado en ventana de preregistro → `puede_atender_desde = hora_apertura` (invisible al agente hasta que abra)

Esta lógica vive en `insertTurn()` de `db.js` o en una Supabase Edge Function.

---

## 🌐 11. Configuración de Idioma (nueva — no estaba en spec original)

El sistema tiene un locale store (`src/locale.js`) con soporte ES/EN.

**Admin puede:**
- Establecer el idioma por defecto del sistema (guardar en `config_sistema` como `idioma_default`)
- Las claves de strings están en `src/locales/es.js` y `src/locales/en.js`

---

## Resumen de Estado Real

| Sección | DB Lista | UI Lista | Bloqueadores |
|---|---|---|---|
| Dashboard | Parcial | ❌ | `chart.js` no instalado; no hay queries de agrupación |
| Servicios | ✅ (falta `tiempo_estimado_atencion`) | ❌ | — |
| Ventanillas | ✅ (`ventanilla_servicios` vacía) | ❌ | Poblar `ventanilla_servicios` para activar queue |
| Usuarios | Parcial (falta `estado`, `ultima_sesion`) | ❌ | Crear usuarios requiere Edge Function (Admin API) |
| Cola Completa | ✅ (store ya tiene toda la data) | ❌ | — |
| FOH Content | Parcial (solo avisos, sin videos ni scheduling) | ❌ | Ampliar `contenido_foh` |
| Configuración | Parcial (faltan 4 claves) | ❌ | — |
| Auditoría | ❌ (tabla no existe) | ❌ | Crear tabla + triggers |
| Kiosk Ayuda | ❌ (tabla no existe) | ❌ | Crear tabla + ampliar Realtime |
| Horarios | ✅ (hora_apertura/cierre en servicios) | ❌ | Falta `tiempo_preregistro_minutos` en config |
| Idioma | ✅ (locale store existe) | Parcial (solo en Launcher) | — |

---

## Prioridades para Construir `/admin`

1. **Ventanillas** — Asignar servicios a ventanillas (`ventanilla_servicios`). Desbloquea el queue entero.
2. **Servicios** — CRUD con todos los campos existentes.
3. **Cola completa** — El store ya tiene la data; solo falta la tabla UI con filtros y acciones.
4. **Usuarios** — Necesita Edge Function para crear cuentas en Supabase Auth.
5. **Configuración** — Formulario simple sobre `config_sistema` + añadir claves faltantes.
6. **Dashboard** — Instalar `chart.js` + añadir queries de agregación.
7. **FOH Content** — Ampliar `contenido_foh` con videos y scheduling.
8. **Auditoría** — Crear tabla + implementar logging en `db.js`.
9. **Kiosk Ayuda** — Crear tabla + extender Realtime.
