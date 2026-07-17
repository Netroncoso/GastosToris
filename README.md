# GastosToris
Gastos del hogar Compartido
# SplitApp — estructura multi-página

## Qué cambió

Se separó el HTML único en varios archivos, para que sea más fácil de mantener:

```
index.html          → Login + Dashboard (Gastos / Listas / Tareas)
gastos.html          → Todo lo que ya tenías: grupos, participantes, splits, reembolsos, balance
listas.html          → NUEVO: soporta múltiples listas (antes era una sola lista global)
tareas.html          → NUEVO: sección de tareas con prioridad
css/shared.css        → Todos los estilos compartidos
js/supabase-client.js → Config de Supabase (URL + KEY), un solo lugar para cambiarla
js/auth.js            → Verifica sesión en cada página interna y maneja logout
js/utils.js           → fmt() y escapeHtml()
migracion_multi_lista_y_tareas.sql → SQL para correr en Supabase
```

## Pasos para subir

1. **Subí todo tal cual está** (manteniendo la estructura de carpetas) a tu repo de GitHub, en la misma ubicación donde tenías el `index.html` original.
2. **Corré el SQL** de `migracion_multi_lista_y_tareas.sql` en el SQL Editor de Supabase. Esto:
   - Crea la tabla `listas` (para tener varias listas: Supermercado, Viaje, etc.)
   - Agrega la columna `id_lista` a tu tabla `lista_compras` existente
   - Crea la tabla `tareas`
3. **Si ya tenías ítems cargados** en `lista_compras` de antes (sin `id_lista`), en el mismo SQL Editor corré (están comentadas al final del archivo):
   ```sql
   insert into listas (nombre) values ('General');
   update lista_compras set id_lista = (select id from listas where nombre = 'General') where id_lista is null;
   ```
   Si no te importan esos ítems viejos, podés ignorar este paso.
4. **Revisá `js/supabase-client.js`**: ahí está `APP_BASE_URL`. Confirmá que coincide con tu URL real de GitHub Pages (ahora mismo apunta a `https://netroncoso.github.io/GastosToris/`).

## Notas importantes

- **Auth**: `index.html` maneja el login con Google. Las otras 3 páginas (`gastos.html`, `listas.html`, `tareas.html`) verifican la sesión al cargar con `requireAuth()` — si no hay sesión, redirigen solas a `index.html`.
- **Botón "atrás"** en cada página vuelve al dashboard de `index.html` (o a la pantalla anterior dentro de la misma página, como el detalle de un grupo/lista).
- **Nada de tu lógica de gastos cambió** — es exactamente la misma, solo que ahora vive en su propio archivo.
- Agregué `escapeHtml()` en los lugares donde se insertan nombres escritos por el usuario en el HTML, para evitar que un nombre con caracteres raros rompa el render (buena práctica, no afecta el funcionamiento normal).

## Estructura de tablas relevante en Supabase

- `listas` (id, nombre, created_at) — nueva
- `lista_compras` (id, nombre, cantidad, unidad, comprado, comprado_at, created_at, **id_lista** ← nueva columna)
- `tareas` (id, titulo, prioridad, hecha, hecha_at, created_at) — nueva
- El resto (`grupos`, `participantes`, `gastos`, `gastos_participantes`) queda exactamente igual.
