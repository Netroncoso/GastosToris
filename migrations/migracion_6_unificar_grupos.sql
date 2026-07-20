-- ==============================================================================
-- SCRIPT BLINDADO DE MIGRACIÓN
-- ==============================================================================

-- 1) Limpiamos el rastro de intentos fallidos anteriores (¡Tus backups quedan a salvo!)
drop table if exists grupos cascade;
drop table if exists grupos_miembros cascade;
drop table if exists participantes cascade;
drop table if exists _map_grupos cascade;
drop table if exists _map_participantes cascade;

-- 2) Tablas unificadas (IDs frescos)
create table grupos (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo text not null check (tipo in ('gastos','tareas')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table grupos enable row level security;

create table grupos_miembros (
  id bigint generated always as identity primary key,
  id_grupo bigint not null references grupos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id_grupo, user_id)
);
alter table grupos_miembros enable row level security;

create table participantes (
  id bigint generated always as identity primary key,
  nombre text not null,
  email text,
  id_grupo bigint references grupos(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table participantes enable row level security;

-- 3) Tablas de mapeo old_id -> new_id 
create temporary table _map_grupos (origen text, old_id bigint, new_id bigint);
create temporary table _map_participantes (origen text, old_id bigint, new_id bigint);

-- 4) Migrar GRUPOS fila por fila
do $$
declare
  r record;
  v_new_id bigint;
begin
  for r in select * from _backup_grupos order by id loop
    insert into grupos (nombre, tipo, created_at, created_by)
    values (r."Nombre", 'gastos', r.created_at, r.created_by)
    returning id into v_new_id;
    insert into _map_grupos(origen, old_id, new_id) values ('grupos', r.id, v_new_id);
  end loop;

  for r in select * from _backup_grupos_tareas order by id loop
    insert into grupos (nombre, tipo, created_at, created_by)
    values (r.nombre, 'tareas', r.created_at, r.created_by)
    returning id into v_new_id;
    insert into _map_grupos(origen, old_id, new_id) values ('grupos_tareas', r.id, v_new_id);
  end loop;
end $$;

-- 5) Migrar PARTICIPANTES/PERSONAS fila por fila
do $$
declare
  r record;
  v_new_id bigint;
  v_new_grupo bigint;
begin
  for r in select * from _backup_participantes order by id loop
    select new_id into v_new_grupo from _map_grupos where origen = 'grupos' and old_id = r.id_grupo;
    insert into participantes (nombre, email, id_grupo)
    values (r."Name", lower(r.email), v_new_grupo)
    returning id into v_new_id;
    insert into _map_participantes(origen, old_id, new_id) values ('participantes', r.id, v_new_id);
  end loop;

  for r in select * from _backup_personas_tareas order by id loop
    select new_id into v_new_grupo from _map_grupos where origen = 'grupos_tareas' and old_id = r.id_grupo_tareas;
    insert into participantes (nombre, email, id_grupo)
    values (r.nombre, lower(r.email), v_new_grupo)
    returning id into v_new_id;
    insert into _map_participantes(origen, old_id, new_id) values ('personas_tareas', r.id, v_new_id);
  end loop;
end $$;

-- 6) Migrar MEMBRESÍAS
insert into grupos_miembros (id_grupo, user_id, created_at)
select m.new_id, b.user_id, b.created_at
from _backup_grupos_miembros b
join _map_grupos m on m.origen = 'grupos' and m.old_id = b.id_grupo
on conflict (id_grupo, user_id) do nothing;

insert into grupos_miembros (id_grupo, user_id, created_at)
select m.new_id, b.user_id, b.created_at
from _backup_grupos_tareas_miembros b
join _map_grupos m on m.origen = 'grupos_tareas' and m.old_id = b.id_grupo_tareas
on conflict (id_grupo, user_id) do nothing;

-- 7) TAREAS: Renombrado inteligente y actualización de FKs
DO $$
BEGIN
  -- Solo renombra la columna si NO se había renombrado en un intento anterior
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='id_grupo_tareas') THEN
    ALTER TABLE tareas RENAME COLUMN id_grupo_tareas TO id_grupo;
  END IF;
END $$;

alter table if exists tareas drop constraint if exists tareas_id_grupo_tareas_fkey;
alter table if exists tareas drop constraint if exists tareas_id_grupo_fkey;
alter table if exists tareas drop constraint if exists tareas_id_asignado_fkey;

update tareas t
set id_grupo = m.new_id
from _map_grupos m
where m.origen = 'grupos_tareas' and m.old_id = t.id_grupo;

update tareas t
set id_asignado = m.new_id
from _map_participantes m
where m.origen = 'personas_tareas' and m.old_id = t.id_asignado;

alter table tareas
  add constraint tareas_id_grupo_fkey foreign key (id_grupo) references grupos(id) on delete cascade;
alter table tareas
  add constraint tareas_id_asignado_fkey foreign key (id_asignado) references participantes(id) on delete set null;

-- 8) GASTOS: Actualización de FKs
alter table if exists gastos drop constraint if exists gastos_id_grupo_fkey;
alter table if exists gastos drop constraint if exists gastos_id_pagador_fkey;

update gastos g
set id_grupo = m.new_id
from _map_grupos m
where m.origen = 'grupos' and m.old_id = g.id_grupo;

update gastos g
set id_pagador = m.new_id
from _map_participantes m
where m.origen = 'participantes' and m.old_id = g.id_pagador;

alter table gastos
  add constraint gastos_id_grupo_fkey foreign key (id_grupo) references grupos(id) on delete cascade;
alter table gastos
  add constraint gastos_id_pagador_fkey foreign key (id_pagador) references participantes(id) on delete set null;

-- 9) GASTOS_PARTICIPANTES: Actualización de FK
alter table if exists gastos_participantes drop constraint if exists gastos_participantes_id_participante_fkey;

update gastos_participantes gp
set id_participante = m.new_id
from _map_participantes m
where m.origen = 'participantes' and m.old_id = gp.id_participante;

alter table gastos_participantes
  add constraint gastos_participantes_id_participante_fkey foreign key (id_participante) references participantes(id) on delete cascade;

-- 10) Verificación
do $$
declare
  v_grupos_old int;
  v_grupos_new int;
  v_part_old int;
  v_part_new int;
begin
  select count(*) into v_grupos_old from (
    select id from _backup_grupos union all select id from _backup_grupos_tareas
  ) x;
  select count(*) into v_grupos_new from grupos;

  select count(*) into v_part_old from (
    select id from _backup_participantes union all select id from _backup_personas_tareas
  ) x;
  select count(*) into v_part_new from participantes;

  if v_grupos_old != v_grupos_new then
    raise exception 'Mismatch en grupos: % filas viejas vs % nuevas', v_grupos_old, v_grupos_new;
  end if;
  if v_part_old != v_part_new then
    raise exception 'Mismatch en participantes: % filas viejas vs % nuevas', v_part_old, v_part_new;
  end if;
  raise notice 'OK: % grupos y % participantes migrados correctamente.', v_grupos_new, v_part_new;
end $$;

-- 11) Índices
create index if not exists idx_lista_compras_id_lista on lista_compras(id_lista);
create index if not exists idx_gastos_id_grupo on gastos(id_grupo);
create index if not exists idx_participantes_id_grupo on participantes(id_grupo);
create index if not exists idx_tareas_id_grupo on tareas(id_grupo);
create index if not exists idx_tareas_id_asignado on tareas(id_asignado);
create index if not exists idx_gastos_participantes_id_gasto on gastos_participantes(id_gasto);
create index if not exists idx_grupos_miembros_id_grupo_user on grupos_miembros(id_grupo, user_id);
create index if not exists idx_participantes_lower_email on participantes ((lower(email)));

-- 12) RLS Políticas
drop policy if exists "ver grupos" on grupos;
create policy "ver grupos" on grupos for select to authenticated using (
  grupos.created_by = auth.uid()
  or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = auth.uid())
  or exists (select 1 from participantes p where p.id_grupo = grupos.id and lower(p.email) = lower(auth.jwt() ->> 'email'))
);

drop policy if exists "crear grupos" on grupos;
create policy "crear grupos" on grupos for insert to authenticated with check (true);

drop policy if exists "actualizar grupos" on grupos;
create policy "actualizar grupos" on grupos for update to authenticated using (grupos.created_by = auth.uid() or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = auth.uid())) with check (grupos.created_by = auth.uid() or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = auth.uid()));

drop policy if exists "borrar grupos" on grupos;
create policy "borrar grupos" on grupos for delete to authenticated using (grupos.created_by = auth.uid() or exists (select 1 from grupos_miembros gm where gm.id_grupo = grupos.id and gm.user_id = auth.uid()));

drop policy if exists "ver grupos_miembros" on grupos_miembros;
create policy "ver grupos_miembros" on grupos_miembros for select to authenticated using (user_id = auth.uid());

drop policy if exists "crear grupos_miembros" on grupos_miembros;
create policy "crear grupos_miembros" on grupos_miembros for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "actualizar grupos_miembros" on grupos_miembros;
create policy "actualizar grupos_miembros" on grupos_miembros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "borrar grupos_miembros" on grupos_miembros;
create policy "borrar grupos_miembros" on grupos_miembros for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ver participantes" on participantes;
create policy "ver participantes" on participantes for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = auth.uid())
  or lower(participantes.email) = lower(auth.jwt() ->> 'email')
);

drop policy if exists "crear participantes" on participantes;
create policy "crear participantes" on participantes for insert to authenticated with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "actualizar participantes" on participantes;
create policy "actualizar participantes" on participantes for update to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = auth.uid())) with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "borrar participantes" on participantes;
create policy "borrar participantes" on participantes for delete to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = participantes.id_grupo and gm.user_id = auth.uid()));

alter table gastos enable row level security;
drop policy if exists "ver gastos" on gastos;
create policy "ver gastos" on gastos for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = auth.uid())
  or exists (select 1 from participantes p where p.id_grupo = gastos.id_grupo and lower(p.email) = lower(auth.jwt() ->> 'email'))
);

drop policy if exists "crear gastos" on gastos;
create policy "crear gastos" on gastos for insert to authenticated with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "actualizar gastos" on gastos;
create policy "actualizar gastos" on gastos for update to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = auth.uid())) with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "borrar gastos" on gastos;
create policy "borrar gastos" on gastos for delete to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = gastos.id_grupo and gm.user_id = auth.uid()));

alter table tareas enable row level security;
drop policy if exists "ver tareas" on tareas;
create policy "ver tareas" on tareas for select to authenticated using (
  exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = auth.uid())
  or exists (select 1 from participantes p where p.id_grupo = tareas.id_grupo and lower(p.email) = lower(auth.jwt() ->> 'email'))
);

drop policy if exists "crear tareas" on tareas;
create policy "crear tareas" on tareas for insert to authenticated with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "actualizar tareas" on tareas;
create policy "actualizar tareas" on tareas for update to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = auth.uid())) with check (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = auth.uid()));

drop policy if exists "borrar tareas" on tareas;
create policy "borrar tareas" on tareas for delete to authenticated using (exists (select 1 from grupos_miembros gm where gm.id_grupo = tareas.id_grupo and gm.user_id = auth.uid()));

-- 13) Triggers
create or replace function set_created_by_grupos_fn() returns trigger as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_created_by_grupos on grupos;
create trigger set_created_by_grupos before insert on grupos for each row execute function set_created_by_grupos_fn();

create or replace function auto_membership_grupos_fn() returns trigger as $$
begin
  insert into grupos_miembros (id_grupo, user_id)
  values (new.id, new.created_by)
  on conflict (id_grupo, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists auto_membership_grupos on grupos;
create trigger auto_membership_grupos after insert on grupos for each row execute function auto_membership_grupos_fn();

-- 14) RPCs
drop function if exists public.crear_grupo_tareas(text);
drop function if exists public.crear_grupo_gastos(text);

create or replace function public.crear_grupo_gastos(p_nombre text)
returns grupos language plpgsql security definer set search_path to 'public' as $$
declare
  v_grupo grupos;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;
  insert into grupos (nombre, tipo) values (p_nombre, 'gastos') returning * into v_grupo;
  return v_grupo;
end;
$$;

create function public.crear_grupo_tareas(p_nombre text)
returns grupos language plpgsql security definer set search_path to 'public' as $$
declare
  v_grupo grupos;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'No autenticado'; end if;
  insert into grupos (nombre, tipo) values (p_nombre, 'tareas') returning * into v_grupo;
  return v_grupo;
end;
$$;

commit;