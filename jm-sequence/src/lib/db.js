import { supabase } from './supabase.js'

// ─── Health check ──────────────────────────────────────────────────────────────

export async function testConnection() {
  console.log('[db] testConnection: starting...')
  try {
    console.log('[db] testConnection: attempting to query servicios (1 row limit)')
    const response = await fetch(
      'https://zkldrnhipsejoefljkud.supabase.co/rest/v1/servicios?limit=1',
      {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        }
      }
    )
    console.log('[db] testConnection: fetch completed with status', response.status)
    const data = await response.json()
    console.log('[db] testConnection: got data', data)
    return { success: true, data }
  } catch (e) {
    console.error('[db] testConnection exception:', e)
    return { success: false, error: e.message }
  }
}

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
  console.log('[db] fetchTurns: starting...')
  try {
    console.log('[db] fetchTurns: about to call supabase.from("turnos")')
    const query = supabase
      .from('turnos')
      .select(TURN_SELECT)
      .in('estado', ['espera', 'llamado', 'diferido', 'atendido', 'noshow'])
      .order('created_at', { ascending: false })
      .limit(200)
    console.log('[db] fetchTurns: query built, now awaiting...')
    const { data, error } = await query
    console.log('[db] fetchTurns: got response', { hasData: !!data, hasError: !!error })
    if (error) {
      console.error('[db] fetchTurns error:', error)
      throw error
    }
    console.log('[db] fetchTurns: completed, rows:', data?.length)
    return data.map(mapTurnRow)
  } catch (e) {
    console.error('[db] fetchTurns exception:', e)
    throw e
  }
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
  console.log('[db] fetchConditions: starting...')
  try {
    console.log('[db] fetchConditions: querying...')
    const { data, error } = await supabase
      .from('condiciones_especiales')
      .select('id, nombre, icono, orden')
      .eq('activa', true)
      .order('orden')
    console.log('[db] fetchConditions: got response', { hasData: !!data, hasError: !!error })
    if (error) throw error
    console.log('[db] fetchConditions: completed, rows:', data?.length)
    return data
  } catch (e) {
    console.error('[db] fetchConditions exception:', e)
    throw e
  }
}

export async function fetchServices() {
  console.log('[db] fetchServices: starting...')
  try {
    console.log('[db] fetchServices: querying...')
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre, nombre_corto, prefijo_turno, color_token, icono_codigo, orden_kiosk')
      .eq('estado', 'activo')
      .order('orden_kiosk')
    console.log('[db] fetchServices: got response', { hasData: !!data, hasError: !!error })
    if (error) throw error
    console.log('[db] fetchServices: completed, rows:', data?.length)
    return data
  } catch (e) {
    console.error('[db] fetchServices exception:', e)
    throw e
  }
}

export async function fetchCounters() {
  console.log('[db] fetchCounters: starting...')
  try {
    console.log('[db] fetchCounters: building parallel queries')
    const [{ data: counters, error: ce }, { data: activeTurnos, error: te }] = await Promise.all([
      (async () => {
        console.log('[db] fetchCounters: querying ventanillas')
        return await supabase
          .from('ventanillas')
          .select('id, numero, etiqueta, estado, agente_id, es_prioritaria, ventanilla_servicios(servicio_id)')
          .order('numero')
      })(),
      (async () => {
        console.log('[db] fetchCounters: querying active turnos')
        return await supabase
          .from('turnos')
          .select('id, ventanilla_id')
          .eq('estado', 'llamado')
      })(),
    ])
    console.log('[db] fetchCounters: got response', { hasCounters: !!counters, hasTurnos: !!activeTurnos, ce, te })
    if (ce) throw ce
    if (te) throw te

    const activeMap = Object.fromEntries(
      (activeTurnos ?? []).map(t => [t.ventanilla_id, t.id])
    )

    const result = (counters ?? []).map(row => ({
      id:            row.id,
      numero:        row.numero,
      label:         row.etiqueta,
      status:        row.estado === 'activa' ? 'active' : 'inactive',
      esPrioritaria: row.es_prioritaria ?? false,
      serviceIDs:    (row.ventanilla_servicios ?? []).map(vs => vs.servicio_id),
      currentTurnId: activeMap[row.id] ?? null,
    }))
    console.log('[db] fetchCounters: completed, counters:', result.length)
    return result
  } catch (e) {
    console.error('[db] fetchCounters exception:', e)
    throw e
  }
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function insertTurn({ serviceId, patientName, idNumber, condicionIds }) {
  console.log('[db] insertTurn: starting...', { serviceId, patientName, idNumber, condicionIds })
  const prioridad = condicionIds?.length ? 'especial' : 'regular'
  const payload = {
    servicio_id:        serviceId,
    prioridad,
    estado:             'espera',
    paciente_nombre:    patientName || null,
    paciente_id_number: idNumber || null,
    call_count:         0,
    call_log:           [],
    reinstated:         false,
    no_show_occurred:   false,
    // numero is NOT sent — DB trigger fn_generate_turno_numero() sets it automatically
  }
  console.log('[db] insertTurn: payload', payload)
  const { data, error } = await supabase
    .from('turnos')
    .insert(payload)
    .select('id, numero')
    .single()
  console.log('[db] insertTurn: response', { data, error })
  if (error) {
    console.error('[db] insertTurn error:', error)
    throw error
  }

  if (condicionIds?.length) {
    console.log('[db] insertTurn: inserting condiciones...', condicionIds)
    const { error: condError } = await supabase.from('turno_condiciones').insert(
      condicionIds.map(cid => ({ turno_id: data.id, condicion_id: cid }))
    )
    if (condError) console.error('[db] insertTurn condiciones error:', condError)
  }

  console.log('[db] insertTurn: completed', data)
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

export function subscribeToChanges({ onTurnoChange, onVentanillaChange, onVentanillaServicioChange }) {
  const channel = supabase
    .channel('jm-sequence-global')
    .on('postgres_changes', { event: '*',    schema: 'public', table: 'turnos'               }, onTurnoChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ventanillas'         }, onVentanillaChange)
    .on('postgres_changes', { event: '*',    schema: 'public', table: 'ventanilla_servicios'  }, onVentanillaServicioChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
