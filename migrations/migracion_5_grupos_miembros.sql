-- MIGRACIÓN 5: Grupos con membresía por usuario
-- Esta migración agrega membresías para los grupos de Gastos y Tareas
-- y restringe visibilidad/ediciones a los usuarios que pertenecen a cada grupo.

-- 1) Membresía para grupos de Gastos
create table if not exists grupos_miembros (
    id bigint generated always as identity primary key,
    id_grupo bigint not null references grupos(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (id_grupo, user_id)
);

alter table grupos_miembros enable row level security;

drop policy if exists "ver grupos_miembros" on grupos_miembros;
create policy "ver grupos_miembros" on grupos_miembros
    for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "crear grupos_miembros" on grupos_miembros;
create policy "crear grupos_miembros" on grupos_miembros
    for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "borrar grupos_miembros" on grupos_miembros;
create policy "borrar grupos_miembros" on grupos_miembros
    for delete
    to authenticated
    using (user_id = auth.uid());

-- 2) Restringir grupos de Gastos a sus miembros
alter table grupos enable row level security;

drop policy if exists "ver grupos" on grupos;
create policy "ver grupos" on grupos
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = grupos.id
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear grupos" on grupos;
create policy "crear grupos" on grupos
    for insert
    to authenticated
    with check (true);

drop policy if exists "actualizar grupos" on grupos;
create policy "actualizar grupos" on grupos
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = grupos.id
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = grupos.id
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar grupos" on grupos;
create policy "borrar grupos" on grupos
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = grupos.id
              and gm.user_id = auth.uid()
        )
    );

-- 3) Restringir gastos y participantes a miembros del grupo
alter table gastos enable row level security;

drop policy if exists "ver gastos" on gastos;
create policy "ver gastos" on gastos
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = gastos.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear gastos" on gastos;
create policy "crear gastos" on gastos
    for insert
    to authenticated
    with check (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = gastos.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "actualizar gastos" on gastos;
create policy "actualizar gastos" on gastos
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = gastos.id_grupo
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = gastos.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar gastos" on gastos;
create policy "borrar gastos" on gastos
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = gastos.id_grupo
              and gm.user_id = auth.uid()
        )
    );

alter table participantes enable row level security;

drop policy if exists "ver participantes" on participantes;
create policy "ver participantes" on participantes
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = participantes.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear participantes" on participantes;
create policy "crear participantes" on participantes
    for insert
    to authenticated
    with check (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = participantes.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "actualizar participantes" on participantes;
create policy "actualizar participantes" on participantes
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = participantes.id_grupo
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = participantes.id_grupo
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar participantes" on participantes;
create policy "borrar participantes" on participantes
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_miembros gm
            where gm.id_grupo = participantes.id_grupo
              and gm.user_id = auth.uid()
        )
    );

alter table gastos_participantes enable row level security;

drop policy if exists "ver gastos_participantes" on gastos_participantes;
create policy "ver gastos_participantes" on gastos_participantes
    for select
    to authenticated
    using (
        exists (
            select 1 from gastos g
            join grupos_miembros gm on gm.id_grupo = g.id_grupo
            where g.id = gastos_participantes.id_gasto
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear gastos_participantes" on gastos_participantes;
create policy "crear gastos_participantes" on gastos_participantes
    for insert
    to authenticated
    with check (
        exists (
            select 1 from gastos g
            join grupos_miembros gm on gm.id_grupo = g.id_grupo
            where g.id = gastos_participantes.id_gasto
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "actualizar gastos_participantes" on gastos_participantes;
create policy "actualizar gastos_participantes" on gastos_participantes
    for update
    to authenticated
    using (
        exists (
            select 1 from gastos g
            join grupos_miembros gm on gm.id_grupo = g.id_grupo
            where g.id = gastos_participantes.id_gasto
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from gastos g
            join grupos_miembros gm on gm.id_grupo = g.id_grupo
            where g.id = gastos_participantes.id_gasto
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar gastos_participantes" on gastos_participantes;
create policy "borrar gastos_participantes" on gastos_participantes
    for delete
    to authenticated
    using (
        exists (
            select 1 from gastos g
            join grupos_miembros gm on gm.id_grupo = g.id_grupo
            where g.id = gastos_participantes.id_gasto
              and gm.user_id = auth.uid()
        )
    );

-- 4) Membresía para grupos de Tareas
create table if not exists grupos_tareas_miembros (
    id bigint generated always as identity primary key,
    id_grupo_tareas bigint not null references grupos_tareas(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (id_grupo_tareas, user_id)
);

alter table grupos_tareas_miembros enable row level security;

drop policy if exists "ver grupos_tareas_miembros" on grupos_tareas_miembros;
create policy "ver grupos_tareas_miembros" on grupos_tareas_miembros
    for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "crear grupos_tareas_miembros" on grupos_tareas_miembros;
create policy "crear grupos_tareas_miembros" on grupos_tareas_miembros
    for insert
    to authenticated
    with check (user_id = auth.uid());

drop policy if exists "borrar grupos_tareas_miembros" on grupos_tareas_miembros;
create policy "borrar grupos_tareas_miembros" on grupos_tareas_miembros
    for delete
    to authenticated
    using (user_id = auth.uid());

alter table grupos_tareas enable row level security;

drop policy if exists "ver grupos_tareas" on grupos_tareas;
create policy "ver grupos_tareas" on grupos_tareas
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = grupos_tareas.id
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear grupos_tareas" on grupos_tareas;
create policy "crear grupos_tareas" on grupos_tareas
    for insert
    to authenticated
    with check (true);

drop policy if exists "actualizar grupos_tareas" on grupos_tareas;
create policy "actualizar grupos_tareas" on grupos_tareas
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = grupos_tareas.id
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = grupos_tareas.id
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar grupos_tareas" on grupos_tareas;
create policy "borrar grupos_tareas" on grupos_tareas
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = grupos_tareas.id
              and gm.user_id = auth.uid()
        )
    );

alter table tareas enable row level security;

drop policy if exists "ver tareas" on tareas;
create policy "ver tareas" on tareas
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear tareas" on tareas;
create policy "crear tareas" on tareas
    for insert
    to authenticated
    with check (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "actualizar tareas" on tareas;
create policy "actualizar tareas" on tareas
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar tareas" on tareas;
create policy "borrar tareas" on tareas
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

alter table personas_tareas enable row level security;

drop policy if exists "ver personas_tareas" on personas_tareas;
create policy "ver personas_tareas" on personas_tareas
    for select
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            join grupos_tareas gt on gt.id = personas_tareas.id_grupo_tareas
            where gm.id_grupo_tareas = personas_tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "crear personas_tareas" on personas_tareas;
create policy "crear personas_tareas" on personas_tareas
    for insert
    to authenticated
    with check (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = personas_tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "actualizar personas_tareas" on personas_tareas;
create policy "actualizar personas_tareas" on personas_tareas
    for update
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = personas_tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = personas_tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );

drop policy if exists "borrar personas_tareas" on personas_tareas;
create policy "borrar personas_tareas" on personas_tareas
    for delete
    to authenticated
    using (
        exists (
            select 1 from grupos_tareas_miembros gm
            where gm.id_grupo_tareas = personas_tareas.id_grupo_tareas
              and gm.user_id = auth.uid()
        )
    );
