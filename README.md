# SplitApp — estructura multi-página

## Qué cambió

Se separó el HTML único en varios archivos, para que sea más fácil de mantener. Cada sección es **independiente**, con su propio concepto de "grupo" cuando aplica:

```
index.html                              → Login + Dashboard (Gastos / Listas / Tareas)
gastos.html                              → Grupos y participantes PROPIOS de Gastos: splits, reembolsos, balance, fecha de gasto
listas.html                              → Listas de compras independientes (Supermercado, Viaje, etc.), sin grupos
tareas.html                              → Grupos y personas PROPIOS de Tareas, vínculo con Listas, y vencimiento sincronizado con Google Calendar
migracion_multi_lista_y_tareas.sql       → SQL para correr en Supabase (v1)
migracion_2_fecha_y_asignados.sql        → SQL para correr en Supabase (v2: fecha de gasto)
migracion_3_tareas_grupos_propios.sql    → SQL para correr en Supabase (v3, versión FINAL de tareas)
migracion_4_calendar_sync.sql            → SQL para correr en Supabase (v4: Google Calendar)
migracion_5_grupos_miembros.sql           → SQL para miembros de grupos y RLS por usuario
edge-function-calendar-sync.ts           → Código para pegar en Supabase Edge Functions (esto NO va a GitHub Pages)
css/
└── shared.css                           → Todos los estilos compartidos
js/
├── supabase-client.js                   → Config de Supabase (URL + KEY), un solo lugar para cambiarla
├── auth.js                              → Verifica sesión en cada página interna y maneja logout
└── utils.js                             → fmt(), escapeHtml(), hoyISO(), parseFechaLocal(), formatFechaHora(), callCalendarSync()
```

## Cómo funciona cada sección

- **Gastos**: tiene sus propios `grupos` y `participantes` (ej: "Viaje a Bariloche", con Juan y María). Ahí adentro: gastos con split, reembolsos, balance, y una pestaña **📊 Resumen** con el total y el % que representa cada tipo de gasto (Comida, Transporte, etc.) sobre el total del grupo — sin filtrar por fecha, es sobre todos los gastos de ese grupo/viaje/mes. No necesita ninguna migración nueva, usa los mismos datos que ya existen.
- **Listas**: no tiene grupos — es simplemente una lista de "listas de compras" (Supermercado, Farmacia, Viaje) cada una con sus ítems. No tiene personas asociadas.
- **Tareas**: tiene sus **propios** grupos (`grupos_tareas`, ej: "Casa", "Oficina") con sus **propias** personas (`personas_tareas`) — completamente separados de los grupos/participantes de Gastos, para no forzarte a compartir gente o contexto entre ambos módulos. Al agregar una persona podés poner su email para invitarla por mail (igual que en Gastos). Dentro de un grupo de tareas, cada tarea:
  - se puede asignar a una persona de ese grupo,
  - tiene prioridad (alta/media/baja),
  - se puede vincular opcionalmente con una **Lista** (de las de la sección Listas, que es global) — aparece un botón 🛒 que te lleva directo a esa lista,
  - se puede poner una **fecha y hora de vencimiento**, que crea automáticamente un evento en el **Google Calendar** de quien está logueado (ver sección de abajo para el setup). Si la persona asignada tiene email cargado, se la invita como asistente al evento (Google le manda un mail de invitación). Al borrar la tarea, el evento se borra también.

Los tres módulos son independientes entre sí salvo por dos puentes: tarea → lista, y tarea → evento de Google Calendar.

## ⚙️ Setup de Google Calendar (una sola vez)

Esto es lo único que no se hace subiendo archivos a GitHub — hay que configurarlo en Google Cloud y en Supabase.

1. **Google Cloud Console** (ya lo hiciste): Calendar API habilitada + scope `calendar.events` agregado a la pantalla de consentimiento de tu credencial "Supabase Web".
2. **Supabase → Authentication → Providers → Google**: confirmá que el Client ID y Client Secret cargados ahí sean los mismos de esa credencial (deberían estarlo, ya los usás para el login).
3. **Supabase → Edge Functions → Create a new function**:
   - Nombre exacto: `calendar-sync`
   - Pegá todo el contenido de `edge-function-calendar-sync.ts`
   - Deploy
4. **Supabase → Edge Functions → Manage secrets** (o Settings → Edge Functions): agregá
   - `GOOGLE_CLIENT_ID` = el Client ID de la credencial "Supabase Web"
   - `GOOGLE_CLIENT_SECRET` = el Client Secret de esa misma credencial
5. **Corré `migracion_4_calendar_sync.sql`** en el SQL Editor de Supabase (crea la tabla `google_tokens` y las columnas `fecha_vencimiento`/`google_event_id` en `tareas`).
6. **Importante**: vos y quien más use la app tienen que **cerrar sesión y volver a loguearse una vez** — recién ahí Google va a pedir el permiso nuevo de Calendar y la app va a poder guardar el token. Si alguien no ve que las tareas se sincronizan, ese suele ser el motivo.

**Limitación a tener en cuenta**: el evento se crea en el calendario de **quien está logueado y crea la tarea**, no en el de la persona "asignada" (eso no es técnicamente posible sin que esa persona también esté logueada en la app con su propia cuenta). Si la persona asignada tiene un email cargado, sí se la invita como asistente al evento — así igual le llega a su calendario, vía la invitación de Google.

## ⚠️ Antes de subir: borrá lo viejo

Si en tu repo ya tenías carpetas `css/` o `js/` de una versión anterior, o un `tareas.html`/migración de una versión intermedia (con grupos de Gastos compartidos), **reemplazalos** por estos — no los mezcles.

## Pasos para subir

1. Borrá las carpetas `css/` y `js/` viejas de tu repo (si existen), y cualquier archivo de una migración de tareas anterior que no sea la de acá.
2. Subí esta versión completa, respetando exactamente esta estructura:
   - `index.html`, `gastos.html`, `listas.html`, `tareas.html`, los `.sql` y este `README.md` van sueltos en la **raíz** del repo.
   - `shared.css` va **dentro de una carpeta `css/`**.
   - `supabase-client.js`, `auth.js`, `utils.js` van **dentro de una carpeta `js/`**.

   Para crear las carpetas al subir por la web de GitHub: usá "Add file → Create new file" y escribí el nombre completo con la barra, por ejemplo `css/shared.css` — GitHub crea la carpeta sola al ver la barra. O arrastrá la carpeta `css` completa (no su contenido suelto) al uploader.
3. **Corré el SQL** de los 5 archivos en el SQL Editor de Supabase, EN ESTE ORDEN:
   - `migracion_multi_lista_y_tareas.sql` — crea `listas`, agrega `id_lista` a `lista_compras`, crea `tareas`
   - `migracion_2_fecha_y_asignados.sql` — agrega `fecha_gasto` a `gastos`
   - `migracion_3_tareas_grupos_propios.sql` — crea `grupos_tareas` y `personas_tareas` (escopeada a un grupo), conecta `tareas` a ambos, y agrega `id_lista` para el vínculo con Listas
   - `migracion_4_calendar_sync.sql` — crea `google_tokens`, y agrega `fecha_vencimiento`/`google_event_id` a `tareas`
   - `migracion_5_grupos_miembros.sql` — agrega membresía de usuarios a grupos de Gastos y Tareas, y aplica políticas RLS para que solo los miembros vean/editen cada grupo
4. **Si ya tenías ítems cargados** en `lista_compras` de antes (sin `id_lista`), corré en el SQL Editor (están comentadas al final del primer archivo):
   ```sql
   insert into listas (nombre) values ('General');
   update lista_compras set id_lista = (select id from listas where nombre = 'General') where id_lista is null;
   ```
   Si no te importan esos ítems viejos, podés ignorar este paso.
5. **Revisá `js/supabase-client.js`**: ahí está `APP_BASE_URL`. Confirmá que coincide con tu URL real de GitHub Pages (ahora mismo apunta a `https://netroncoso.github.io/GastosToris/`).

## Notas importantes

- **Auth**: `index.html` maneja el login con Google. Las otras 3 páginas verifican la sesión al cargar con `requireAuth()` — si no hay sesión, redirigen solas a `index.html`.
- **Botón "atrás"** en cada página vuelve al dashboard de `index.html` (o a la pantalla anterior dentro de la misma página, como el detalle de un grupo).
- Se usa `escapeHtml()` en los lugares donde se insertan nombres escritos por el usuario en el HTML, para evitar que un nombre con caracteres raros rompa el render.

## Estructura de tablas relevante en Supabase

- `grupos` (id, Nombre, created_at) — solo para Gastos
- `participantes` (id, id_grupo, Name, email) — solo para Gastos
- `listas` (id, nombre, created_at) — global, sin grupos
- `lista_compras` (id, nombre, cantidad, unidad, comprado, comprado_at, created_at, **id_lista**)
- `grupos_tareas` (id, nombre, created_at) — solo para Tareas
- `personas_tareas` (id, nombre, email, created_at, **id_grupo_tareas**) — solo para Tareas, escopeada a un grupo de tareas
- `tareas` (id, titulo, prioridad, hecha, hecha_at, created_at, **id_grupo_tareas**, **id_asignado** → personas_tareas, **id_lista** → listas, **fecha_vencimiento**, **google_event_id**)
- `google_tokens` (**user_id** → auth.users, refresh_token, updated_at) — un refresh token de Google por usuario logueado
- `gastos` (..., **fecha_gasto**)
- `gastos_participantes` — igual que antes
