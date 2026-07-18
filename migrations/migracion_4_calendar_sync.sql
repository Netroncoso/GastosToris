-- =============================================
-- MIGRACIÓN 4: Sincronización de Tareas con Google Calendar
-- Ejecutar en el SQL Editor de Supabase
-- =============================================

-- 1) Tabla para guardar el refresh token de Google de cada usuario logueado.
--    Se llena sola cuando la persona inicia sesión (index.html la escribe).
--    Solo la Edge Function (con la service role key) y el propio usuario
--    pueden leer/escribir su fila.
create table if not exists google_tokens (
    user_id uuid primary key references auth.users(id) on delete cascade,
    refresh_token text not null,
    updated_at timestamptz not null default now()
);

alter table google_tokens enable row level security;

drop policy if exists "el usuario ve su propio token" on google_tokens;
create policy "el usuario ve su propio token"
    on google_tokens for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "el usuario inserta su propio token" on google_tokens;
create policy "el usuario inserta su propio token"
    on google_tokens for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "el usuario actualiza su propio token" on google_tokens;
create policy "el usuario actualiza su propio token"
    on google_tokens for update
    to authenticated
    using (auth.uid() = user_id);

-- 2) Fecha y hora de vencimiento de la tarea (para el evento de calendario)
alter table tareas add column if not exists fecha_vencimiento timestamptz;

-- 3) ID del evento creado en Google Calendar, para poder borrarlo/editarlo después
alter table tareas add column if not exists google_event_id text;
