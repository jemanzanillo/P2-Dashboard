-- ============================================================================
-- RLS FLIP — full patient isolation for jm-sequence (project ref zkldrnhipsejoefljkud)
-- ============================================================================
-- THIS IS THE BREAKING STEP. Do NOT run it until ALL of the following are true:
--
--   1. The new frontend (FOH anonymous sign-in + kiosk RPC counts/creation) is
--      DEPLOYED to production (Vercel). Running this against the OLD frontend
--      takes down the live FOH + kiosk instantly, because they rely on anon
--      SELECT on `turnos` that this migration removes.
--   2. "Anonymous sign-ins" is ENABLED in the Supabase dashboard
--      (Authentication -> Sign In / Providers -> Anonymous). This cannot be
--      toggled via SQL/MCP. Without it, FOH cannot get an identity and goes dark.
--   3. You are ready to run QA_CHECKLIST.md section 6 on real devices immediately
--      after, WITH RLS ON.
--
-- The additive RPCs (get_waiting_counts, create_kiosk_turn) are already live and
-- are inert until this flip; everything below is safe to review now.
--
-- Apply via Supabase MCP apply_migration (name: enable_rls_patient_isolation)
-- or the SQL editor. Wrapped in a transaction so a failure rolls back cleanly.
-- ============================================================================

begin;

-- ── turnos: drop the permissive anon/over-broad policies ────────────────────
drop policy if exists "Kiosk puede leer turnos"                   on public.turnos; -- anon read ALL turns (PII)
drop policy if exists "FOH puede leer turnos del día"             on public.turnos; -- public role, replaced below
drop policy if exists "Authenticated users can read turnos"       on public.turnos; -- every agent read every counter
drop policy if exists "Authenticated users can update turnos"     on public.turnos; -- any authed update any turn
drop policy if exists "Agentes autenticados pueden actualizar turnos" on public.turnos;
drop policy if exists "Kiosk puede crear turnos"                  on public.turnos; -- creation now via SECURITY DEFINER RPC

-- ── turnos: scoped SELECT ───────────────────────────────────────────────────
--   admin              → all turns
--   anonymous (FOH/TV) → today's turns only
--   agent              → only turns for services assigned to their ventanilla
-- (auth.uid()/jwt wrapped in subselects so they evaluate once, not per-row.)
create policy "turnos_select_scoped" on public.turnos
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = true
      and created_at >= current_date
    )
    or (
      servicio_id in (
        select vs.servicio_id
        from public.ventanilla_servicios vs
        where vs.ventanilla_id = (
          select p.ventanilla_id from public.profiles p where p.id = (select auth.uid())
        )
      )
    )
  );

-- ── turnos: scoped UPDATE (call / finish / transfer / etc.) ──────────────────
--   admin → all; agent → their counter's services; anonymous FOH → never.
create policy "turnos_update_scoped" on public.turnos
  for update to authenticated
  using (
    (select public.is_admin())
    or (
      coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
      and servicio_id in (
        select vs.servicio_id
        from public.ventanilla_servicios vs
        where vs.ventanilla_id = (
          select p.ventanilla_id from public.profiles p where p.id = (select auth.uid())
        )
      )
    )
  )
  with check (
    (select public.is_admin())
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- Note: INSERT into turnos is intentionally left with NO anon policy. The kiosk
-- creates turns exclusively through public.create_kiosk_turn() (SECURITY DEFINER,
-- which bypasses RLS and validates the service + conditions). The pre-existing
-- "Authenticated users can insert turnos" policy remains for any authed path.

-- ── ventanillas: anon kiosk needs the active-counter list ───────────────────
-- (existing SELECT is authenticated-only; kiosk is anon). No PII here.
drop policy if exists "Kiosk puede leer ventanillas activas" on public.ventanillas;
create policy "Kiosk puede leer ventanillas activas" on public.ventanillas
  for select to anon
  using (estado = 'activa');

-- ── Enable RLS — THE FLIP ───────────────────────────────────────────────────
-- Reference tables (servicios, condiciones_especiales, ventanilla_servicios)
-- already carry anon SELECT policies, so the kiosk keeps reading them.
-- turno_condiciones keeps its authenticated SELECT/INSERT; anon is blocked and
-- uses the RPC. FOH (anonymous-authenticated) matches the authenticated read.
alter table public.turnos                enable row level security;
alter table public.turno_condiciones     enable row level security;
alter table public.servicios             enable row level security;
alter table public.condiciones_especiales enable row level security;
alter table public.ventanillas           enable row level security;
alter table public.ventanilla_servicios  enable row level security;

commit;

-- ── Post-flip verification (run after COMMIT) ───────────────────────────────
-- select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind='r' order by relname;
-- Then: get_advisors(type: security) should show the 6 ERROR "RLS disabled"
-- advisors cleared. Run QA_CHECKLIST.md section 6 on real devices WITH RLS ON.
