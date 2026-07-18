-- =============================================
-- MIGRACIÓN 3 (versión final): Tareas con sus PROPIOS grupos de personas
--
-- Modelo definitivo:
--   - Gastos sigue usando `grupos` + `participantes` (sin cambios).
--   - Listas sigue siendo independiente, sin grupos (sin cambios).
--   - Tareas tiene AHORA sus propios grupos (`grupos_tareas`) y sus
--     propias personas (`personas_tareas`, escopeadas a un grupo de
--     tareas) — totalmente separados de los grupos/participantes de Gastos.
--   - Cada tarea puede además vincularse opcionalmente a una Lista
--     (tabla `listas`, que es global).
--
-- Es seguro correr esto sin importar qué versión anterior de tareas
-- hayas probado (independiente, o con grupos de gastos).
-- =============================================

-- 1) Grupos propios de Tareas (ej: "Casa", "Oficina")
create table if not exists grupos_tareas (
    id bigint generated always as identity primary key,
    nombre text not null,
    created_at timestamptz not null default now()
);

alter table grupos_tareas enable row level security;

drop policy if exists "ver grupos_tareas" on grupos_tareas;
create policy "ver grupos_tareas" on grupos_tareas for select to authenticated using (true);

drop policy if exists "crear grupos_tareas" on grupos_tareas;
create policy "crear grupos_tareas" on grupos_tareas for insert to authenticated with check (true);

drop policy if exists "borrar grupos_tareas" on grupos_tareas;
create policy "borrar grupos_tareas" on grupos_tareas for delete to authenticated using (true);

-- 2) Personas propias de Tareas (recrear si no existe, por si venís de una
--    versión anterior sin esta tabla)
create table if not exists personas_tareas (
    id bigint generated always as identity primary key,
    nombre text not null,
    created_at timestamptz not null default now()
);

alter table personas_tareas enable row level security;

drop policy if exists "ver personas_tareas" on personas_tareas;
create policy "ver personas_tareas" on personas_tareas for select to authenticated using (true);

drop policy if exists "crear personas_tareas" on personas_tareas;
create policy "crear personas_tareas" on personas_tareas for insert to authenticated with check (true);

drop policy if exists "borrar personas_tareas" on personas_tareas;
create policy "borrar personas_tareas" on personas_tareas for delete to authenticated using (true);

-- 3) Escopear las personas de tareas a un grupo de tareas
alter table personas_tareas add column if not exists id_grupo_tareas bigint references grupos_tareas(id) on delete cascade;

-- 4) Sacar cualquier resto de un vínculo viejo con `participantes` (de Gastos)
--    si llegaste a probar esa versión intermedia
alter table tareas drop constraint if exists tareas_id_asignado_fkey;
alter table tareas drop column if exists id_grupo; -- resto de la versión "tareas con grupos de gastos"
update tareas set id_asignado = null; -- evita conflictos de FK al recrearla

-- 5) Escopear las tareas a un grupo de tareas, y re-vincular la asignación a personas_tareas
alter table tareas add column if not exists id_grupo_tareas bigint references grupos_tareas(id) on delete cascade;
alter table tareas
    add constraint tareas_id_asignado_fkey
    foreign key (id_asignado) references personas_tareas(id) on delete set null;

-- 6) Vínculo opcional con una lista de compras (tabla `listas`, global)
alter table tareas add column if not exists id_lista bigint references listas(id) on delete set null;

-- =============================================
-- Si ya tenías personas_tareas o tareas cargadas ANTES de tener grupos
-- (sin id_grupo_tareas), van a quedar "huérfanas" y no se van a ver en
-- ningún grupo. Si te importan, creá un grupo para ellas y asignalas:
-- =============================================
-- insert into grupos_tareas (nombre) values ('General');
-- update personas_tareas set id_grupo_tareas = (select id from grupos_tareas where nombre = 'General') where id_grupo_tareas is null;
-- update tareas set id_grupo_tareas = (select id from grupos_tareas where nombre = 'General') where id_grupo_tareas is null;
