-- ==============================================================================
-- MIGRACIÓN 7: Optimizar performance de RLS (causa probable de la lentitud
-- al cargar Gastos y Tareas después de unificar los grupos en migración 6)
-- ==============================================================================
--
-- QUÉ PASA:
-- Las políticas RLS de migración 6 llaman a auth.uid() y auth.jwt() "sueltos"
-- dentro del using()/with check(). Postgres no puede cachear esas funciones y
-- las vuelve a ejecutar (current_setting + parseo de JWT) UNA VEZ POR CADA FILA
-- evaluada, incluso dentro de los EXISTS anidados. Es el problema de performance
-- de RLS más común y documentado por Supabase ("Auth RLS Initialization Plan").
--
-- Antes (migración 5/6) cada tabla de membresía era más chica y el problema no
-- se notaba. Al unificar "grupos_miembros" y "participantes" para gastos Y
-- tareas en migración 6, esas tablas pasaron a tener más filas y más consultas
-- pasan por ellas -> el costo por fila de auth.uid()/auth.jwt() se nota más.
--
-- LA SOLUCIÓN (recomendada oficialmente por Supabase): envolver auth.uid() y
-- auth.jwt() en un "(select ...)". Esto permite que Postgres los evalúe UNA
-- SOLA VEZ por consulta (initplan) en lugar de una vez por fila.
--
-- También corremos ANALYZE sobre las tablas recreadas en migración 6, porque
-- una tabla recién creada + repoblada fila por fila puede quedar con
-- estadísticas viejas/vacías y el planner elige planes sub-óptimos hasta que
-- autovacuum corre el ANALYZE automático (que puede tardar).

analyze grupos;
analyze grupos_miembros;
analyze participantes;
analyze gastos;
analyze gastos_participantes;
analyze tareas;

-- ==============================================================================
-- GRUPOS
-- ==============================================================================
drop policy if exists "ver grupos" on grupos;
create policy "ver grupos" on grupos for select to authenticated using (
  grupos.created_by = (select auth.uid())
  or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = (select auth.uid()))
  or exists (select 1 from participantes p where p.id_grupo = grupos.id and lower(p.email) = lower((select auth.jwt() ->> 'email')))
);

drop policy if exists "actualizar grupos" on grupos;
create policy "actualizar grupos" on grupos for update to authenticated
  using (grupos.created_by = (select auth.uid()) or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = (select auth.uid())))
  with check (grupos.created_by = (select auth.uid()) or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = (select auth.uid())));

drop policy if exists "borrar grupos" on grupos;
create policy "borrar grupos" on grupos for delete to authenticated using (
  grupos.created_by = (select auth.uid())
  or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = (select auth.uid()))
);

-- ==============================================================================
-- GRUPOS_MIEMBROS
-- ==============================================================================
drop policy if exists "ver grupos_miembros" on grupos_miembros;
create policy "ver grupos_miembros" on grupos_miembros for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "crear grupos_miembros" on grupos_miembros;
create policy "crear grupos_miembros" on grupos_miembros for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "actualizar grupos_miembros" on grupos_miembros;
create policy "actualizar grupos_miembros" on grupos_miembros for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "borrar grupos_miembros" on grupos_miembros;
create policy "borrar grupos_miembros" on grupos_miembros for delete to authenticated using (user_id = (select auth.uid()));

-- ==============================================================================
-- PARTICIPANTES
-- ==============================================================================
drop policy if exists "ver participantes" on participantes;
create policy "ver participantes" on participantes for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = (select auth.uid()))
  or lower(participantes.email) = lower((select auth.jwt() ->> 'email'))
);

drop policy if exists "crear participantes" on participantes;
create policy "crear participantes" on participantes for insert to authenticated with check (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = (select auth.uid()))
);

drop policy if exists "actualizar participantes" on participantes;
create policy "actualizar participantes" on participantes for update to authenticated
  using (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = (select auth.uid())))
  with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = (select auth.uid())));

drop policy if exists "borrar participantes" on participantes;
create policy "borrar participantes" on participantes for delete to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = (select auth.uid()))
);

-- ==============================================================================
-- GASTOS
-- ==============================================================================
drop policy if exists "ver gastos" on gastos;
create policy "ver gastos" on gastos for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = (select auth.uid()))
  or exists (select 1 from participantes p where p.id_grupo = gastos.id_grupo and lower(p.email) = lower((select auth.jwt() ->> 'email')))
);

drop policy if exists "crear gastos" on gastos;
create policy "crear gastos" on gastos for insert to authenticated with check (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = (select auth.uid()))
);

drop policy if exists "actualizar gastos" on gastos;
create policy "actualizar gastos" on gastos for update to authenticated
  using (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = (select auth.uid())))
  with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = (select auth.uid())));

drop policy if exists "borrar gastos" on gastos;
create policy "borrar gastos" on gastos for delete to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = (select auth.uid()))
);

-- ==============================================================================
-- TAREAS
-- ==============================================================================
drop policy if exists "ver tareas" on tareas;
create policy "ver tareas" on tareas for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = (select auth.uid()))
  or exists (select 1 from participantes p where p.id_grupo = tareas.id_grupo and lower(p.email) = lower((select auth.jwt() ->> 'email')))
);

drop policy if exists "crear tareas" on tareas;
create policy "crear tareas" on tareas for insert to authenticated with check (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = (select auth.uid()))
);

drop policy if exists "actualizar tareas" on tareas;
create policy "actualizar tareas" on tareas for update to authenticated
  using (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = (select auth.uid())))
  with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = (select auth.uid())));

drop policy if exists "borrar tareas" on tareas;
create policy "borrar tareas" on tareas for delete to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = (select auth.uid()))
);

-- ==============================================================================
-- GASTOS_PARTICIPANTES
-- ==============================================================================
drop policy if exists "ver gastos_participantes" on gastos_participantes;
create policy "ver gastos_participantes" on gastos_participantes for select to authenticated using (
  exists (
    select 1 from gastos g
    join grupos_miembros gm on gm.id_grupo = g.id_grupo
    where g.id = gastos_participantes.id_gasto and gm.user_id = (select auth.uid())
  )
);

drop policy if exists "crear gastos_participantes" on gastos_participantes;
create policy "crear gastos_participantes" on gastos_participantes for insert to authenticated with check (
  exists (
    select 1 from gastos g
    join grupos_miembros gm on gm.id_grupo = g.id_grupo
    where g.id = gastos_participantes.id_gasto and gm.user_id = (select auth.uid())
  )
);

drop policy if exists "actualizar gastos_participantes" on gastos_participantes;
create policy "actualizar gastos_participantes" on gastos_participantes for update to authenticated
  using (exists (
    select 1 from gastos g
    join grupos_miembros gm on gm.id_grupo = g.id_grupo
    where g.id = gastos_participantes.id_gasto and gm.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gastos g
    join grupos_miembros gm on gm.id_grupo = g.id_grupo
    where g.id = gastos_participantes.id_gasto and gm.user_id = (select auth.uid())
  ));

drop policy if exists "borrar gastos_participantes" on gastos_participantes;
create policy "borrar gastos_participantes" on gastos_participantes for delete to authenticated using (
  exists (
    select 1 from gastos g
    join grupos_miembros gm on gm.id_grupo = g.id_grupo
    where g.id = gastos_participantes.id_gasto and gm.user_id = (select auth.uid())
  )
);
