import { supabase } from './supabase.js'

// ─── Row mapper ────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  espera:    'waiting',
  diferido:  'deferred',
  llamado:   'called',
  atendido:  'attended',
  noshow:    'skipped',
  cancelado: 'cancelled',
}

export function mapTurnRow(row) {
  const firstCondicion = row.turno_condiciones?.[0]?.condicion
  return {
    id:               row.numero,
    dbId:             row.id,
    serviceID:        row.servicio_id,
    serviceLabel:     row.servicio?.nombre ?? '',
    servicePrefijo:   row.servicio?.prefijo_turno ?? '',
    priority:         row.prioridad === 'especial' ? 'special' : 'normal',
    status:           STATUS_MAP[row.estado] ?? row.estado,
    createdAt:        row.created_at,
    calledAt:         row.called_at,
    patientName:      row.paciente_nombre ?? '',
    idNumber:         row.paciente_id_number ?? '',
    specialCondition: firstCondicion?.nombre ?? 'Normal',
    callCount:        row.call_count ?? 0,
    callLog:          row.call_log ?? [],
    lastCalledAt:     row.call_log?.at(-1)?.timestamp ?? null,
    durationMs:       row.tiempo_atencion_segundos != null
                        ? row.tiempo_atencion_segundos * 1000
                        : null,
    reinstated:       row.reinstated ?? false,
    noShowOccurred:   row.no_show_occurred ?? false,
    noShowOverride:   row.no_show_override ?? false,
    counterId:        row.ventanilla_id,
  }
}

const TURN_SELECT = `
  id, numero, servicio_id,
  servicio:servicios(id, nombre, nombre_corto, prefijo_turno, color_token),
  prioridad, estado,
  created_at, called_at, atencion_inicio_at, finished_at,
  paciente_nombre, paciente_id_number,
  puede_atender_desde, ventanilla_id,
  tiempo_espera_segundos, tiempo_atencion_segundos,
  call_count, call_log,
  reinstated, no_show_occurred, no_show_override,
  turno_condiciones(condicion:condiciones_especiales(id, nombre, icono))
`

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function fetchTurns() {
  const { data, error } = await supabase
    .from('turnos')
    .select(TURN_SELECT)
    .in('estado', ['espera', 'llamado', 'diferido', 'atendido', 'noshow'])
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data.map(mapTurnRow)
}

export async function fetchSingleTurn(uuid) {
  const { data, error } = await supabase
    .from('turnos')
    .select(TURN_SELECT)
    .eq('id', uuid)
    .single()
  if (error) return null
  return mapTurnRow(data)
}

export async function fetchConditions() {
  const { data, error } = await supabase
    .from('condiciones_especiales')
    .select('id, nombre, icono, orden')
    .eq('activa', true)
    .order('orden')
  if (error) throw error
  return data
}

export async function fetchServices() {
  const { data, error } = await supabase
    .from('servicios')
    .select('id, nombre, nombre_corto, prefijo_turno, color_token, icono_codigo, orden_kiosk')
    .eq('estado', 'activo')
    .order('orden_kiosk')
  if (error) throw error
  return data
}

export async function fetchCounters() {
  const [{ data: counters, error: ce }, { data: activeTurnos, error: te }] = await Promise.all([
    supabase
      .from('ventanillas')
      .select('id, numero, etiqueta, estado, agente_id, es_prioritaria, ventanilla_servicios(servicio_id)')
      .order('numero'),
    supabase
      .from('turnos')
      .select('id, ventanilla_id')
      .eq('estado', 'llamado'),
  ])
  if (ce) throw ce
  if (te) throw te

  const activeMap = Object.fromEntries(
    (activeTurnos ?? []).map(t => [t.ventanilla_id, t.id])
  )

  return (counters ?? []).map(row => ({
    id:            row.id,
    numero:        row.numero,
    label:         row.etiqueta,
    status:        row.estado === 'activa' ? 'active' : 'inactive',
    esPrioritaria: row.es_prioritaria ?? false,
    serviceIDs:    (row.ventanilla_servicios ?? []).map(vs => vs.servicio_id),
    currentTurnId: activeMap[row.id] ?? null,
  }))
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function insertTurn({ serviceId, patientName, idNumber, condicionIds }) {
  const prioridad = condicionIds?.length ? 'especial' : 'regular'
  const { data, error } = await supabase
    .from('turnos')
    .insert({
      servicio_id:        serviceId,
      prioridad,
      estado:             'espera',
      paciente_nombre:    patientName || null,
      paciente_id_number: idNumber || null,
      call_count:         0,
      call_log:           [],
      reinstated:         false,
      no_show_occurred:   false,
    })
    .select('id, numero')
    .single()
  if (error) throw error

  if (condicionIds?.length) {
    await supabase.from('turno_condiciones').insert(
      condicionIds.map(cid => ({ turno_id: data.id, condicion_id: cid }))
    )
  }
  return data
}

export async function callTurn({ dbId, ventanillaId, calledAt }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      estado:        'llamado',
      called_at:     calledAt,
      ventanilla_id: ventanillaId,
      call_count:    1,
      call_log:      [{ callNumber: 1, timestamp: calledAt }],
    })
    .eq('id', dbId)
  if (error) throw error
}

export async function recallTurn({ dbId, callCount, callLog }) {
  const { error } = await supabase
    .from('turnos')
    .update({ call_count: callCount, call_log: callLog })
    .eq('id', dbId)
  if (error) throw error
}

export async function finishTurn({ dbId, durationSeconds }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      estado:                   'atendido',
      finished_at:              new Date().toISOString(),
      tiempo_atencion_segundos: durationSeconds,
    })
    .eq('id', dbId)
  if (error) throw error
}

export async function markNoShow({ dbId, override, durationSeconds }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      estado:                   'noshow',
      finished_at:              new Date().toISOString(),
      tiempo_atencion_segundos: durationSeconds,
      no_show_override:         override,
      no_show_occurred:         true,
    })
    .eq('id', dbId)
  if (error) throw error
}

export async function reinstateTurn({ dbId }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      estado:              'diferido',
      reinstated:          true,
      puede_atender_desde: '1970-01-01T00:00:00Z',
      called_at:           null,
      call_count:          0,
      call_log:            [],
      no_show_override:    false,
    })
    .eq('id', dbId)
  if (error) throw error
}

export async function suspendTurn({ dbId }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      estado:              'diferido',
      puede_atender_desde: new Date().toISOString(),
    })
    .eq('id', dbId)
  if (error) throw error
}

export async function cancelTurn({ dbId, motivo }) {
  const { error } = await supabase
    .from('turnos')
    .update({ estado: 'cancelado', motivo_anulacion: motivo ?? null })
    .eq('id', dbId)
  if (error) throw error
}

export async function transferTurn({ dbId, newVentanillaId }) {
  const { error } = await supabase
    .from('turnos')
    .update({
      ventanilla_id:       newVentanillaId,
      estado:              'diferido',
      puede_atender_desde: '1970-01-01T00:00:00Z',
      reinstated:          true,
      called_at:           null,
      call_count:          0,
    })
    .eq('id', dbId)
  if (error) throw error
}

// ─── Realtime ──────────────────────────────────────────────────────────────────

export async function fetchFohVideos() {
  const { data, error } = await supabase
    .from('contenido_foh')
    .select('id, nombre, url, orden')
    .eq('tipo', 'video')
    .eq('activo', true)
    .order('orden')
  if (error) throw error
  return data ?? []
}

// ─── Admin ─────────────────────────────────────────────────────────────────────

export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, rol, ventanilla_id')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export async function updateProfile({ id, ventanillaId }) {
  const { error } = await supabase
    .from('profiles')
    .update({ ventanilla_id: ventanillaId ?? null })
    .eq('id', id)
  if (error) throw error
}

export async function updateVentanilla({ id, etiqueta, estado, esPrioritaria }) {
  const { error } = await supabase
    .from('ventanillas')
    .update({ etiqueta, estado, es_prioritaria: esPrioritaria })
    .eq('id', id)
  if (error) throw error
}

export async function assignServicesToCounter({ ventanillaId, serviceIds }) {
  const { error: delError } = await supabase
    .from('ventanilla_servicios')
    .delete()
    .eq('ventanilla_id', ventanillaId)
  if (delError) throw delError

  if (serviceIds.length === 0) return

  const { error: insError } = await supabase
    .from('ventanilla_servicios')
    .insert(serviceIds.map(sid => ({ ventanilla_id: ventanillaId, servicio_id: sid })))
  if (insError) throw insError
}

export async function fetchConfigSistema() {
  const { data, error } = await supabase
    .from('config_sistema')
    .select('clave, valor')
    .order('clave')
  if (error) throw error
  return data ?? []
}

export async function updateConfigItem({ clave, valor }) {
  const { error } = await supabase
    .from('config_sistema')
    .update({ valor })
    .eq('clave', clave)
  if (error) throw error
}

export function subscribeToChanges({ onTurnoChange, onVentanillaChange }) {
  const channel = supabase
    .channel('jm-sequence-global')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, onTurnoChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ventanillas' }, onVentanillaChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
