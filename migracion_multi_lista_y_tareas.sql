-- =============================================
-- MIGRACIÓN: soporte multi-lista + tareas
-- Ejecutar en el SQL Editor de Supabase
-- =============================================

-- 1) Tabla de "listas" (carpetas): Supermercado, Viaje a Bariloche, etc.
create table if not exists listas (
    id bigint generated always as identity primary key,
    nombre text not null,
    created_at timestamptz not null default now()
);

alter table listas enable row level security;

create policy "Cualquier usuario autenticado puede ver listas"
    on listas for select
    to authenticated
    using (true);

create policy "Cualquier usuario autenticado puede crear listas"
    on listas for insert
    to authenticated
    with check (true);

create policy "Cualquier usuario autenticado puede borrar listas"
    on listas for delete
    to authenticated
    using (true);

-- 2) Agregar id_lista a lista_compras (si ya tenías la tabla vieja con una sola lista global)
alter table lista_compras
    add column if not exists id_lista bigint references listas(id) on delete cascade;

-- Si ya tenías ítems cargados sin lista, creá una lista "General" y asignalos:
-- insert into listas (nombre) values ('General');
-- update lista_compras set id_lista = (select id from listas where nombre = 'General') where id_lista is null;

-- 3) Tabla de tareas
create table if not exists tareas (
    id bigint generated always as identity primary key,
    titulo text not null,
    prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
    hecha boolean not null default false,
    hecha_at timestamptz,
    created_at timestamptz not null default now()
);

alter table tareas enable row level security;

create policy "Cualquier usuario autenticado puede ver tareas"
    on tareas for select
    to authenticated
    using (true);

create policy "Cualquier usuario autenticado puede crear tareas"
    on tareas for insert
    to authenticated
    with check (true);

create policy "Cualquier usuario autenticado puede actualizar tareas"
    on tareas for update
    to authenticated
    using (true);

create policy "Cualquier usuario autenticado puede borrar tareas"
    on tareas for delete
    to authenticated
    using (true);
