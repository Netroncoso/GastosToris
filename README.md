# SplitApp — estructura multi-página

## Qué cambió

Se separó el HTML único en varios archivos, para que sea más fácil de mantener. Esta versión usa subcarpetas para tener todo ordenado:

```
index.html                          → Login + Dashboard (Gastos / Listas / Tareas)
gastos.html                          → Grupos, participantes, splits, reembolsos, balance (con fecha de gasto)
listas.html                          → Soporta múltiples listas (Supermercado, Viaje, etc.)
tareas.html                          → Tareas organizadas por los MISMOS grupos y personas que Gastos
migracion_multi_lista_y_tareas.sql   → SQL para correr en Supabase (v1)
migracion_2_fecha_y_asignados.sql    → SQL para correr en Supabase (v2: fecha de gasto + asignación)
migracion_3_tareas_con_grupos.sql    → SQL para correr en Supabase (v3: tareas usa grupos/participantes)
css/
└── shared.css                       → Todos los estilos compartidos
js/
├── supabase-client.js               → Config de Supabase (URL + KEY), un solo lugar para cambiarla
├── auth.js                          → Verifica sesión en cada página interna y maneja logout
└── utils.js                         → fmt(), escapeHtml(), hoyISO(), parseFechaLocal()
```

## ⚠️ Antes de subir: borrá lo viejo

Si en tu repo ya tenías carpetas `css/` o `js/` de una versión anterior, **borralas primero por completo** antes de subir estos archivos. Mezclar archivos viejos y nuevos en las mismas carpetas es lo que causó los 404 hasta ahora.

## Pasos para subir

1. Borrá las carpetas `css/` y `js/` viejas de tu repo (si existen).
2. Subí esta versión completa, respetando exactamente esta estructura:
   - `index.html`, `gastos.html`, `listas.html`, `tareas.html`, los `.sql` y este `README.md` van sueltos en la **raíz** del repo.
   - `shared.css` va **dentro de una carpeta `css/`**.
   - `supabase-client.js`, `auth.js`, `utils.js` van **dentro de una carpeta `js/`**.

   Para crear las carpetas al subir por la web de GitHub: usá "Add file → Create new file" y escribí el nombre completo con la barra, por ejemplo `css/shared.css` — GitHub crea la carpeta sola al ver la barra. O arrastrá la carpeta `css` completa (no su contenido suelto) al uploader.
3. **Corré el SQL** de los 3 archivos en el SQL Editor de Supabase, EN ESTE ORDEN:
   - `migracion_multi_lista_y_tareas.sql` — crea `listas`, agrega `id_lista` a `lista_compras`, crea `tareas`
   - `migracion_2_fecha_y_asignados.sql` — agrega `fecha_gasto` a `gastos`, crea `personas_tareas` y `id_asignado` en `tareas` (una versión intermedia)
   - `migracion_3_tareas_con_grupos.sql` — **este es el modelo final de Tareas**: agrega `id_grupo` a `tareas`, cambia `id_asignado` para que apunte a `participantes` (los mismos de Gastos) en vez de a `personas_tareas`, y borra la tabla vieja `personas_tareas`

   Si es la primera vez que configurás todo, corré los 3 en orden. Si ya habías corrido la 1 y la 2 antes, ahora solo te falta la 3.
4. **Si ya tenías ítems cargados** en `lista_compras` de antes (sin `id_lista`), corré en el SQL Editor (están comentadas al final del primer archivo):
   ```sql
   insert into listas (nombre) values ('General');
   update lista_compras set id_lista = (select id from listas where nombre = 'General') where id_lista is null;
   ```
   Si no te importan esos ítems viejos, podés ignorar este paso.
5. **Revisá `js/supabase-client.js`**: ahí está `APP_BASE_URL`. Confirmá que coincide con tu URL real de GitHub Pages (ahora mismo apunta a `https://netroncoso.github.io/GastosToris/`).

## Notas importantes

- **Auth**: `index.html` maneja el login con Google. Las otras 3 páginas (`gastos.html`, `listas.html`, `tareas.html`) verifican la sesión al cargar con `requireAuth()` — si no hay sesión, redirigen solas a `index.html`.
- **Botón "atrás"** en cada página vuelve al dashboard de `index.html` (o a la pantalla anterior dentro de la misma página, como el detalle de un grupo/lista).
- **Gastos**: al crear un gasto o un reembolso ahora elegís la fecha real en que ocurrió (por defecto, hoy). La lista se ordena por esa fecha.
- **Tareas**: ahora funciona igual que Gastos — elegís un **grupo**, y dentro tenés sus tareas, asignables a cualquiera de las **personas de ese grupo** (las mismas que ves en la pestaña "Personas" de Gastos). Si agregás una persona desde Tareas, también la vas a ver disponible en Gastos, y viceversa — es la misma lista.
- Se usa `escapeHtml()` en los lugares donde se insertan nombres escritos por el usuario en el HTML, para evitar que un nombre con caracteres raros rompa el render.

## Estructura de tablas relevante en Supabase

- `grupos` (id, Nombre, created_at) — **compartida** entre Gastos y Tareas
- `participantes` (id, id_grupo, Name, email) — **compartida** entre Gastos y Tareas
- `listas` (id, nombre, created_at)
- `lista_compras` (id, nombre, cantidad, unidad, comprado, comprado_at, created_at, **id_lista**)
- `tareas` (id, titulo, prioridad, hecha, hecha_at, created_at, **id_grupo**, **id_asignado** → participantes)
- `gastos` (..., **fecha_gasto**)
- `gastos_participantes` — igual que antes
- ~~`personas_tareas`~~ — tabla intermedia, se borra en la migración 3 (ya no se usa)
