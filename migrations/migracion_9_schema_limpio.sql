-- ==============================================================================
-- MIGRACIÓN 9: Schema limpio alineado a la app
-- ==============================================================================
-- Dominio:
--   circulos           = grupo de personas (Hogar, Viaje con los chicos)
--   circulos_miembros  = quién tiene acceso auth al círculo
--   participantes      = personas del círculo (splits / asignación)
--   periodos           = carpetas de gastos (Agosto, Viaje Entre Ríos)
--   gastos             = gastos de un periodo
--   listas / lista_compras / tareas = del círculo
--
-- Se conserva google_tokens. El resto se recrea (sin datos reales).

-- ------------------------------------------------------------------------------
-- 1) Tirar legado
-- ------------------------------------------------------------------------------
drop trigger if exists trg_gastos_set_grupo on gastos;
drop trigger if exists auto_membership_grupos on grupos;
drop trigger if exists set_created_by_grupos on grupos;

drop function if exists public.fn_gastos_set_grupo_desde_periodo() cascade;
drop function if exists public.auto_membership_grupos_fn() cascade;
drop function if exists public.auto_membership_grupos_tareas_fn() cascade;
drop function if exists public.set_created_by_grupos_fn() cascade;
drop function if exists public.set_created_by_grupos_tareas_fn() cascade;
drop function if exists public.fn_auto_membresia_grupo() cascade;
drop function if exists public.fn_auto_membresia_grupo_tareas() cascade;
drop function if exists public.crear_grupo(text) cascade;
drop function if exists public.crear_grupo_gastos(text) cascade;
drop function if exists public.crear_grupo_tareas(text) cascade;
drop function if exists public.crear_periodo(bigint, text) cascade;
drop function if exists public.es_miembro_grupo(bigint) cascade;
drop function if exists public.es_invitado_grupo(bigint) cascade;

drop table if exists gastos_participantes cascade;
drop table if exists gastos cascade;
drop table if exists periodos cascade;
drop table if exists tareas cascade;
drop table if exists lista_compras cascade;
drop table if exists listas cascade;
drop table if exists participantes cascade;
drop table if exists grupos_miembros cascade;
drop table if exists grupos cascade;

-- ------------------------------------------------------------------------------
-- 2) Tablas
-- ------------------------------------------------------------------------------
create table circulos (
  id bigint generated always as identity primary key,
  nombre text not null,
  categorias jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_circulos_created_at on circulos (created_at desc);
create index idx_circulos_created_by on circulos (created_by);

create table circulos_miembros (
  id bigint generated always as identity primary key,
  id_circulo bigint not null references circulos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id_circulo, user_id)
);

create index idx_circulos_miembros_user on circulos_miembros (user_id, id_circulo);
create index idx_circulos_miembros_circulo on circulos_miembros (id_circulo, user_id);

create table participantes (
  id bigint generated always as identity primary key,
  id_circulo bigint not null references circulos(id) on delete cascade,
  nombre text not null,
  email text,
  created_at timestamptz not null default now()
);

create index idx_participantes_circulo on participantes (id_circulo);
create index idx_participantes_email on participantes (lower(email));
create index idx_participantes_email_circulo on participantes (lower(email), id_circulo);

create table periodos (
  id bigint generated always as identity primary key,
  id_circulo bigint not null references circulos(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create index idx_periodos_circulo_created on periodos (id_circulo, created_at desc);

create table gastos (
  id bigint generated always as identity primary key,
  id_periodo bigint not null references periodos(id) on delete cascade,
  -- denormalizado para RLS indexado (sin join en cada fila)
  id_circulo bigint not null references circulos(id) on delete cascade,
  id_pagador bigint references participantes(id) on delete set null,
  concepto text,
  monto numeric,
  tipo_gasto text,
  fecha_gasto date default current_date,
  created_at timestamptz not null default now()
);

create index idx_gastos_periodo_fecha on gastos (id_periodo, fecha_gasto desc, created_at desc);
create index idx_gastos_circulo on gastos (id_circulo);

create table gastos_participantes (
  id bigint generated always as identity primary key,
  id_gasto bigint not null references gastos(id) on delete cascade,
  id_participante bigint not null references participantes(id) on delete cascade,
  monto numeric not null
);

create index idx_gastos_participantes_gasto on gastos_participantes (id_gasto);

create table listas (
  id bigint generated always as identity primary key,
  id_circulo bigint not null references circulos(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create index idx_listas_circulo_created on listas (id_circulo, created_at desc);

create table lista_compras (
  id bigint generated always as identity primary key,
  id_lista bigint not null references listas(id) on delete cascade,
  nombre text not null,
  cantidad numeric,
  unidad text,
  comprado boolean default false,
  comprado_at timestamptz,
  created_at timestamptz default now()
);

create index idx_lista_compras_lista on lista_compras (id_lista);

create table tareas (
  id bigint generated always as identity primary key,
  id_circulo bigint not null references circulos(id) on delete cascade,
  titulo text not null,
  prioridad text not null default 'media',
  hecha boolean not null default false,
  hecha_at timestamptz,
  id_asignado bigint references participantes(id) on delete set null,
  id_lista bigint references listas(id) on delete set null,
  fecha_vencimiento timestamptz,
  google_event_id text,
  invitados_calendar text[] default '{}',
  created_at timestamptz not null default now()
);

create index idx_tareas_circulo on tareas (id_circulo);
create index idx_tareas_asignado on tareas (id_asignado);

-- ------------------------------------------------------------------------------
-- 3) Triggers
-- ------------------------------------------------------------------------------
create or replace function public.set_created_by_circulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create trigger trg_circulos_created_by
  before insert on circulos
  for each row execute function public.set_created_by_circulo();

create or replace function public.auto_membresia_circulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into circulos_miembros (id_circulo, user_id)
    values (new.id, new.created_by)
    on conflict (id_circulo, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_circulos_membresia
  after insert on circulos
  for each row execute function public.auto_membresia_circulo();

create or replace function public.gastos_set_circulo_desde_periodo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.id_circulo into new.id_circulo
  from periodos p
  where p.id = new.id_periodo;
  if new.id_circulo is null then
    raise exception 'Periodo inválido';
  end if;
  return new;
end;
$$;

create trigger trg_gastos_set_circulo
  before insert or update of id_periodo on gastos
  for each row execute function public.gastos_set_circulo_desde_periodo();

-- ------------------------------------------------------------------------------
-- 4) Helpers RLS
-- ------------------------------------------------------------------------------
create or replace function public.es_miembro_circulo(p_id_circulo bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from circulos_miembros m
    where m.id_circulo = p_id_circulo
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.es_invitado_circulo(p_id_circulo bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from participantes p
    where p.id_circulo = p_id_circulo
      and p.email is not null
      and lower(p.email) = lower((select auth.jwt() ->> 'email'))
  );
$$;

revoke all on function public.es_miembro_circulo(bigint) from public, anon;
revoke all on function public.es_invitado_circulo(bigint) from public, anon;
grant execute on function public.es_miembro_circulo(bigint) to authenticated;
grant execute on function public.es_invitado_circulo(bigint) to authenticated;

revoke all on function public.set_created_by_circulo() from public, anon, authenticated;
revoke all on function public.auto_membresia_circulo() from public, anon, authenticated;
revoke all on function public.gastos_set_circulo_desde_periodo() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5) RPCs
-- ------------------------------------------------------------------------------
create or replace function public.crear_circulo(p_nombre text)
returns circulos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row circulos;
begin
  if (select auth.uid()) is null then raise exception 'No autenticado'; end if;
  insert into circulos (nombre) values (p_nombre) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.crear_periodo(p_id_circulo bigint, p_nombre text)
returns periodos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row periodos;
begin
  if (select auth.uid()) is null then raise exception 'No autenticado'; end if;
  if not public.es_miembro_circulo(p_id_circulo) then
    raise exception 'No tenés acceso a este círculo';
  end if;
  insert into periodos (id_circulo, nombre)
  values (p_id_circulo, p_nombre)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.crear_circulo(text) from public, anon;
revoke all on function public.crear_periodo(bigint, text) from public, anon;
grant execute on function public.crear_circulo(text) to authenticated;
grant execute on function public.crear_periodo(bigint, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 6) RLS
-- ------------------------------------------------------------------------------
alter table circulos enable row level security;
alter table circulos_miembros enable row level security;
alter table participantes enable row level security;
alter table periodos enable row level security;
alter table gastos enable row level security;
alter table gastos_participantes enable row level security;
alter table listas enable row level security;
alter table lista_compras enable row level security;
alter table tareas enable row level security;

-- CIRCULOS
create policy "ver circulos" on circulos for select to authenticated using (
  created_by = (select auth.uid())
  or public.es_miembro_circulo(id)
  or public.es_invitado_circulo(id)
);
create policy "crear circulos" on circulos for insert to authenticated
  with check ((select auth.uid()) is not null);
create policy "actualizar circulos" on circulos for update to authenticated
  using (created_by = (select auth.uid()) or public.es_miembro_circulo(id))
  with check (created_by = (select auth.uid()) or public.es_miembro_circulo(id));
create policy "borrar circulos" on circulos for delete to authenticated using (
  created_by = (select auth.uid()) or public.es_miembro_circulo(id)
);

-- MIEMBROS
create policy "ver miembros" on circulos_miembros for select to authenticated
  using (user_id = (select auth.uid()));
create policy "crear miembros" on circulos_miembros for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "actualizar miembros" on circulos_miembros for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "borrar miembros" on circulos_miembros for delete to authenticated
  using (user_id = (select auth.uid()));

-- PARTICIPANTES
create policy "ver participantes" on participantes for select to authenticated using (
  public.es_miembro_circulo(id_circulo)
  or lower(email) = lower((select auth.jwt() ->> 'email'))
);
create policy "crear participantes" on participantes for insert to authenticated
  with check (public.es_miembro_circulo(id_circulo));
create policy "actualizar participantes" on participantes for update to authenticated
  using (public.es_miembro_circulo(id_circulo))
  with check (public.es_miembro_circulo(id_circulo));
create policy "borrar participantes" on participantes for delete to authenticated
  using (public.es_miembro_circulo(id_circulo));

-- PERIODOS
create policy "ver periodos" on periodos for select to authenticated using (
  public.es_miembro_circulo(id_circulo) or public.es_invitado_circulo(id_circulo)
);
create policy "crear periodos" on periodos for insert to authenticated
  with check (public.es_miembro_circulo(id_circulo));
create policy "actualizar periodos" on periodos for update to authenticated
  using (public.es_miembro_circulo(id_circulo))
  with check (public.es_miembro_circulo(id_circulo));
create policy "borrar periodos" on periodos for delete to authenticated
  using (public.es_miembro_circulo(id_circulo));

-- GASTOS
create policy "ver gastos" on gastos for select to authenticated using (
  public.es_miembro_circulo(id_circulo) or public.es_invitado_circulo(id_circulo)
);
create policy "crear gastos" on gastos for insert to authenticated
  with check (public.es_miembro_circulo(id_circulo));
create policy "actualizar gastos" on gastos for update to authenticated
  using (public.es_miembro_circulo(id_circulo))
  with check (public.es_miembro_circulo(id_circulo));
create policy "borrar gastos" on gastos for delete to authenticated
  using (public.es_miembro_circulo(id_circulo));

-- GASTOS_PARTICIPANTES
create policy "ver gastos_participantes" on gastos_participantes for select to authenticated using (
  exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_circulo(g.id_circulo))
);
create policy "crear gastos_participantes" on gastos_participantes for insert to authenticated with check (
  exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_circulo(g.id_circulo))
);
create policy "actualizar gastos_participantes" on gastos_participantes for update to authenticated
  using (exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_circulo(g.id_circulo)))
  with check (exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_circulo(g.id_circulo)));
create policy "borrar gastos_participantes" on gastos_participantes for delete to authenticated using (
  exists (select 1 from gastos g where g.id = gastos_participantes.id_gasto and public.es_miembro_circulo(g.id_circulo))
);

-- LISTAS
create policy "ver listas" on listas for select to authenticated using (
  public.es_miembro_circulo(id_circulo) or public.es_invitado_circulo(id_circulo)
);
create policy "crear listas" on listas for insert to authenticated
  with check (public.es_miembro_circulo(id_circulo));
create policy "actualizar listas" on listas for update to authenticated
  using (public.es_miembro_circulo(id_circulo))
  with check (public.es_miembro_circulo(id_circulo));
create policy "borrar listas" on listas for delete to authenticated
  using (public.es_miembro_circulo(id_circulo));

-- LISTA_COMPRAS
create policy "ver lista_compras" on lista_compras for select to authenticated using (
  exists (
    select 1 from listas l
    where l.id = lista_compras.id_lista
      and (public.es_miembro_circulo(l.id_circulo) or public.es_invitado_circulo(l.id_circulo))
  )
);
create policy "crear lista_compras" on lista_compras for insert to authenticated with check (
  exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_circulo(l.id_circulo))
);
create policy "actualizar lista_compras" on lista_compras for update to authenticated
  using (exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_circulo(l.id_circulo)))
  with check (exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_circulo(l.id_circulo)));
create policy "borrar lista_compras" on lista_compras for delete to authenticated using (
  exists (select 1 from listas l where l.id = lista_compras.id_lista and public.es_miembro_circulo(l.id_circulo))
);

-- TAREAS
create policy "ver tareas" on tareas for select to authenticated using (
  public.es_miembro_circulo(id_circulo) or public.es_invitado_circulo(id_circulo)
);
create policy "crear tareas" on tareas for insert to authenticated
  with check (public.es_miembro_circulo(id_circulo));
create policy "actualizar tareas" on tareas for update to authenticated
  using (public.es_miembro_circulo(id_circulo))
  with check (public.es_miembro_circulo(id_circulo));
create policy "borrar tareas" on tareas for delete to authenticated
  using (public.es_miembro_circulo(id_circulo));

analyze circulos;
analyze circulos_miembros;
analyze participantes;
analyze periodos;
analyze gastos;
analyze gastos_participantes;
analyze listas;
analyze lista_compras;
analyze tareas;
