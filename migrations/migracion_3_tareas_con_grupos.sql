-- =============================================
-- MIGRACIÓN 3: Tareas ahora usa los mismos GRUPOS y PARTICIPANTES que Gastos
-- (reemplaza el sistema anterior de "personas_tareas", que era independiente)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de las migraciones 1 y 2
-- =============================================

-- 1) Vincular cada tarea a un grupo (mismo concepto de "grupo" que en Gastos)
alter table tareas add column if not exists id_grupo bigint references grupos(id) on delete cascade;

-- 2) Antes de cambiar a qué tabla apunta la asignación, vaciamos la columna
--    para evitar errores si tenías tareas asignadas con el sistema viejo
--    (ids de la tabla personas_tareas, que ya no vamos a usar)
update tareas set id_asignado = null;

-- 3) Cambiar la referencia de id_asignado: ahora apunta a participantes(id)
--    en vez de personas_tareas(id)
alter table tareas drop constraint if exists tareas_id_asignado_fkey;
alter table tareas
    add constraint tareas_id_asignado_fkey
    foreign key (id_asignado) references participantes(id) on delete set null;

-- 4) La tabla vieja ya no se usa. Podés borrarla sin problema:
drop table if exists personas_tareas cascade;

-- =============================================
-- Si ya tenías tareas cargadas ANTES de este cambio (sin id_grupo),
-- van a quedar "huérfanas" y no se van a ver en ningún grupo.
-- Si te importan, creá un grupo para ellas y asignalas, por ejemplo:
-- =============================================
-- insert into grupos (Nombre) values ('Tareas generales');
-- update tareas set id_grupo = (select id from grupos where Nombre = 'Tareas generales') where id_grupo is null;
