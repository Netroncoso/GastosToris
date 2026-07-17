-- =============================================
-- MIGRACIÓN 2: fecha de gasto + personas asignables en tareas
-- Ejecutar en el SQL Editor de Supabase
-- (podés correr esto aunque ya hayas corrido la migración anterior)
-- =============================================

-- 1) Fecha real del gasto (antes solo existía created_at, que es cuándo se CARGÓ el gasto,
--    no cuándo ocurrió)
alter table gastos add column if not exists fecha_gasto date default current_date;

-- Rellenar gastos viejos que no tengan fecha_gasto todavía, usando la fecha en que se cargaron
update gastos set fecha_gasto = created_at::date where fecha_gasto is null;

-- 2) Personas para asignar tareas (independiente de los participantes de gastos,
--    porque tareas no está atada a un grupo)
create table if not exists personas_tareas (
    id bigint generated always as identity primary key,
    nombre text not null,
    created_at timestamptz not null default now()
);

alter table personas_tareas enable row level security;

create policy "Cualquier usuario autenticado puede ver personas_tareas"
    on personas_tareas for select
    to authenticated
    using (true);

create policy "Cualquier usuario autenticado puede crear personas_tareas"
    on personas_tareas for insert
    to authenticated
    with check (true);

create policy "Cualquier usuario autenticado puede borrar personas_tareas"
    on personas_tareas for delete
    to authenticated
    using (true);

-- 3) Columna de asignación en tareas
alter table tareas
    add column if not exists id_asignado bigint references personas_tareas(id) on delete set null;
