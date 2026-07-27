-- ==============================================================================
-- MIGRACIÓN 8: Círculos (grupos de personas) + Periodos de gastos
-- ==============================================================================
-- Modelo:
--   grupos            = círculo de personas (Hogar, Viaje con los chicos)
--   periodos          = carpetas de gastos dentro del círculo (Agosto, Viaje ER)
--   gastos            = pertenecen a un periodo (id_periodo) + id_grupo denormalizado
--   listas / tareas   = pertenecen al círculo (id_grupo)
--
-- Datos de prueba: se limpia todo (acordado: no hay datos reales).
-- RLS: helper es_miembro_grupo + (select auth.uid()) para initplan.

-- ------------------------------------------------------------------------------
-- 1) Limpiar datos de prueba
-- ------------------------------------------------------------------------------
truncate table gastos_participantes, gastos, tareas, lista_compras, listas,
  participantes, grupos_miembros, grupos restart identity cascade;

-- ------------------------------------------------------------------------------
-- 2) grupos = círculos (sin discriminator tipo)
-- ------------------------------------------------------------------------------
alter table grupos drop constraint if exists grupos_tipo_check;
drop index if exists idx_grupos_tipo_created;
alter table grupos drop column if exists tipo;

create index if not exists idx_grupos_created_at on grupos (created_at desc);

-- ------------------------------------------------------------------------------
-- 3) periodos de gastos
-- ------------------------------------------------------------------------------
create table if not exists periodos (
  id bigint generated always as identity primary key,
  id_grupo bigint not null references grupos(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_periodos_id_grupo_created
  on periodos (id_grupo, created_at desc);

alter table periodos enable row level security;

-- ------------------------------------------------------------------------------
-- 4) gastos: id_periodo + id_grupo denormalizado (RLS rápido, sin join)
-- ------------------------------------------------------------------------------
alter table gastos add column if not exists id_periodo bigint;

-- Con tablas vacías, forzar NOT NULL vía drop/recreate de FK
alter table gastos drop constraint if exists gastos_id_periodo_fkey;
alter table gastos
  alter column id_periodo drop not null; -- temp; set after backfill (none)

-- Dejamos id_grupo: se completa por trigger desde el periodo
create or replace function public.fn_gastos_set_grupo_desde_periodo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.id_grupo into new.id_grupo
  from periodos p
  where p.id = new.id_periodo;
  if new.id_grupo is null then
    raise exception 'Periodo inválido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gastos_set_grupo on gastos;
create trigger trg_gastos_set_grupo
  before insert or update of id_periodo on gastos
  for each row execute function public.fn_gastos_set_grupo_desde_periodo();

-- Hacer id_periodo obligatorio (tabla vacía)
alter table gastos alter column id_periodo set not null;
alter table gastos
  add constraint gastos_id_periodo_fkey
  foreign key (id_periodo) references periodos(id) on delete cascade;

create index if not exists idx_gastos_id_periodo on gastos (id_periodo);
create index if not exists idx_gastos_periodo_fecha
  on gastos (id_periodo, fecha_gasto desc, created_at desc);

-- ------------------------------------------------------------------------------
-- 5) listas por círculo
-- ------------------------------------------------------------------------------
alter table listas add column if not exists id_grupo bigint;

-- Tabla vacía → NOT NULL + FK
update listas set id_grupo = (select id from grupos limit 1) where id_grupo is null; -- no-op si vacía
-- Si quedaron filas huérfanas (no debería), borrarlas
delete from lista_compras where id_lista in (select id from listas where id_grupo is null);
delete from listas where id_grupo is null;

alter table listas alter column id_grupo set not null;
alter table listas drop constraint if exists listas_id_grupo_fkey;
alter table listas
  add constraint listas_id_grupo_fkey
  foreign key (id_grupo) references grupos(id) on delete cascade;

create index if not exists idx_listas_id_grupo_created
  on listas (id_grupo, created_at desc);

-- ------------------------------------------------------------------------------
-- 6) Helper RLS (security definer, 1 lookup indexado)
-- ------------------------------------------------------------------------------
create or replace function public.es_miembro_grupo(p_id_grupo bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from grupos_miembros gm
    where gm.id_grupo = p_id_grupo
      and gm.user_id = (select auth.uid())
  );
$$;

create or replace function public.es_invitado_grupo(p_id_grupo bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from participantes p
    where p.id_grupo = p_id_grupo
      and p.email is not null
      and lower(p.email) = lower((select auth.jwt() ->> 'email'))
  );
$$;

revoke all on function public.es_miembro_grupo(bigint) from public;
revoke all on function public.es_invitado_grupo(bigint) from public;
grant execute on function public.es_miembro_grupo(bigint) to authenticated;
grant execute on function public.es_invitado_grupo(bigint) to authenticated;

-- ------------------------------------------------------------------------------
-- 7) RPCs
-- ------------------------------------------------------------------------------
create or replace function public.crear_grupo(p_nombre text)
returns grupos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo grupos;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;
  insert into grupos (nombre) values (p_nombre) returning * into v_grupo;
  return v_grupo;
end;
$$;

create or replace function public.crear_periodo(p_id_grupo bigint, p_nombre text)
returns periodos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo periodos;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;
  if not public.es_miembro_grupo(p_id_grupo) then
    raise exception 'No tenés acceso a este círculo';
  end if;
  insert into periodos (id_grupo, nombre)
  values (p_id_grupo, p_nombre)
  returning * into v_periodo;
  return v_periodo;
end;
$$;

-- Compat: dejar aliases viejos apuntando al mismo RPC (por si queda código viejo)
create or replace function public.crear_grupo_gastos(p_nombre text)
returns grupos language plpgsql security definer set search_path = public as $$
begin
  return public.crear_grupo(p_nombre);
end;
$$;

create or replace function public.crear_grupo_tareas(p_nombre text)
returns grupos language plpgsql security definer set search_path = public as $$
begin
  return public.crear_grupo(p_nombre);
end;
$$;

-- ------------------------------------------------------------------------------
-- 8) RLS limpio (borrar policies duplicadas/permisivas)
-- ------------------------------------------------------------------------------

-- PERIODOS
drop policy if exists "ver periodos" on periodos;
drop policy if exists "crear periodos" on periodos;
drop policy if exists "actualizar periodos" on periodos;
drop policy if exists "borrar periodos" on periodos;

create policy "ver periodos" on periodos for select to authenticated using (
  public.es_miembro_grupo(id_grupo) or public.es_invitado_grupo(id_grupo)
);
create policy "crear periodos" on periodos for insert to authenticated with check (
  public.es_miembro_grupo(id_grupo)
);
create policy "actualizar periodos" on periodos for update to authenticated
  using (public.es_miembro_grupo(id_grupo))
  with check (public.es_miembro_grupo(id_grupo));
create policy "borrar periodos" on periodos for delete to authenticated using (
  public.es_miembro_grupo(id_grupo)
);

-- GRUPOS
drop policy if exists "ver grupos" on grupos;
drop policy if exists "crear grupos" on grupos;
drop policy if exists "actualizar grupos" on grupos;
drop policy if exists "borrar grupos" on grupos;

create policy "ver grupos" on grupos for select to authenticated using (
  created_by = (select auth.uid())
  or public.es_miembro_grupo(id)
  or public.es_invitado_grupo(id)
);
create policy "crear grupos" on grupos for insert to authenticated with check (true);
create policy "actualizar grupos" on grupos for update to authenticated
  using (created_by = (select auth.uid()) or public.es_miembro_grupo(id))
  with check (created_by = (select auth.uid()) or public.es_miembro_grupo(id));
create policy "borrar grupos" on grupos for delete to authenticated using (
  created_by = (select auth.uid()) or public.es_miembro_grupo(id)
);

-- GRUPOS_MIEMBROS (sin cambios de forma, reafirmar)
drop policy if exists "ver grupos_miembros" on grupos_miembros;
drop policy if exists "crear grupos_miembros" on grupos_miembros;
drop policy if exists "actualizar grupos_miembros" on grupos_miembros;
drop policy if exists "borrar grupos_miembros" on grupos_miembros;

create policy "ver grupos_miembros" on grupos_miembros for select to authenticated
  using (user_id = (select auth.uid()));
create policy "crear grupos_miembros" on grupos_miembros for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "actualizar grupos_miembros" on grupos_miembros for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "borrar grupos_miembros" on grupos_miembros for delete to authenticated
  using (user_id = (select auth.uid()));

-- PARTICIPANTES
drop policy if exists "ver participantes" on participantes;
drop policy if exists "crear participantes" on participantes;
drop policy if exists "actualizar participantes" on participantes;
drop policy if exists "borrar participantes" on participantes;

create policy "ver participantes" on participantes for select to authenticated using (
  public.es_miembro_grupo(id_grupo)
  or lower(email) = lower((select auth.jwt() ->> 'email'))
);
create policy "crear participantes" on participantes for insert to authenticated with check (
  public.es_miembro_grupo(id_grupo)
);
create policy "actualizar participantes" on participantes for update to authenticated
  using (public.es_miembro_grupo(id_grupo))
  with check (public.es_miembro_grupo(id_grupo));
create policy "borrar participantes" on participantes for delete to authenticated using (
  public.es_miembro_grupo(id_grupo)
);

-- GASTOS: limpiar policies viejas/duplicadas
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='gastos' loop
    execute format('drop policy if exists %I on gastos', r.policyname);
  end loop;
end $$;

create policy "ver gastos" on gastos for select to authenticated using (
  public.es_miembro_grupo(id_grupo) or public.es_invitado_grupo(id_grupo)
);
create policy "crear gastos" on gastos for insert to authenticated with check (
  public.es_miembro_grupo(id_grupo)
);
create policy "actualizar gastos" on gastos for update to authenticated
  using (public.es_miembro_grupo(id_grupo))
  with check (public.es_miembro_grupo(id_grupo));
create policy "borrar gastos" on gastos for delete to authenticated using (
  public.es_miembro_grupo(id_grupo)
);

-- GASTOS_PARTICIPANTES
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='gastos_participantes' loop
    execute format('drop policy if exists %I on gastos_participantes', r.policyname);
  end loop;
end $$;

create policy "ver gastos_participantes" on gastos_participantes for select to authenticated using (
  exists (
    select 1 from gastos g
    where g.id = gastos_participantes.id_gasto
      and public.es_miembro_grupo(g.id_grupo)
  )
);
create policy "crear gastos_participantes" on gastos_participantes for insert to authenticated with check (
  exists (
    select 1 from gastos g
    where g.id = gastos_participantes.id_gasto
      and public.es_miembro_grupo(g.id_grupo)
  )
);
create policy "actualizar gastos_participantes" on gastos_participantes for update to authenticated
  using (
    exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_grupo(g.id_grupo))
  )
  with check (
    exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_grupo(g.id_grupo))
  );
create policy "borrar gastos_participantes" on gastos_participantes for delete to authenticated using (
  exists (
    select 1 from gastos g
    where g.id = gastos_participantes.id_gasto
      and public.es_miembro_grupo(g.id_grupo)
  )
);

-- TAREAS
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='tareas' loop
    execute format('drop policy if exists %I on tareas', r.policyname);
  end loop;
end $$;

create policy "ver tareas" on tareas for select to authenticated using (
  public.es_miembro_grupo(id_grupo) or public.es_invitado_grupo(id_grupo)
);
create policy "crear tareas" on tareas for insert to authenticated with check (
  public.es_miembro_grupo(id_grupo)
);
create policy "actualizar tareas" on tareas for update to authenticated
  using (public.es_miembro_grupo(id_grupo))
  with check (public.es_miembro_grupo(id_grupo));
create policy "borrar tareas" on tareas for delete to authenticated using (
  public.es_miembro_grupo(id_grupo)
);

-- LISTAS
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='listas' loop
    execute format('drop policy if exists %I on listas', r.policyname);
  end loop;
end $$;

create policy "ver listas" on listas for select to authenticated using (
  public.es_miembro_grupo(id_grupo) or public.es_invitado_grupo(id_grupo)
);
create policy "crear listas" on listas for insert to authenticated with check (
  public.es_miembro_grupo(id_grupo)
);
create policy "actualizar listas" on listas for update to authenticated
  using (public.es_miembro_grupo(id_grupo))
  with check (public.es_miembro_grupo(id_grupo));
create policy "borrar listas" on listas for delete to authenticated using (
  public.es_miembro_grupo(id_grupo)
);

-- LISTA_COMPRAS
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='lista_compras' loop
    execute format('drop policy if exists %I on lista_compras', r.policyname);
  end loop;
end $$;

create policy "ver lista_compras" on lista_compras for select to authenticated using (
  exists (
    select 1 from listas l
    where l.id = lista_compras.id_lista
      and (public.es_miembro_grupo(l.id_grupo) or public.es_invitado_grupo(l.id_grupo))
  )
);
create policy "crear lista_compras" on lista_compras for insert to authenticated with check (
  exists (
    select 1 from listas l
    where l.id = lista_compras.id_lista
      and public.es_miembro_grupo(l.id_grupo)
  )
);
create policy "actualizar lista_compras" on lista_compras for update to authenticated
  using (
    exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_grupo(l.id_grupo))
  )
  with check (
    exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_grupo(l.id_grupo))
  );
create policy "borrar lista_compras" on lista_compras for delete to authenticated using (
  exists (
    select 1 from listas l
    where l.id = lista_compras.id_lista
      and public.es_miembro_grupo(l.id_grupo)
  )
);

analyze grupos;
analyze grupos_miembros;
analyze participantes;
analyze periodos;
analyze gastos;
analyze gastos_participantes;
analyze tareas;
analyze listas;
analyze lista_compras;
