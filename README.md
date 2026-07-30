# TorisApp

Círculos compartidos para **gastos**, **listas de compras** y **tareas**. Pensada para el hogar, viajes o cualquier grupo chico que necesite repartir plata y organizarse sin cinco apps distintas.

**Demo:** [netroncoso.github.io/GastosToris](https://netroncoso.github.io/GastosToris/)

## Qué hace

- **Círculos** — un espacio por casa, viaje o grupo (personas + módulos)
- **Gastos** — periodos (ej. “Agosto”), splits, reembolsos, balance y resumen por categoría
- **Listas** — pendientes/comprados, plantillas, y **cargar comprados → gasto**
- **Tareas** — prioridades, asignados, vínculo opcional a una lista y sync con Google Calendar
- **PWA** — instalable, modo oscuro, confirmaciones propias (sin el popup del dominio)

Login con **Google** vía Supabase Auth. Los datos viven en Postgres con **RLS** (solo miembros del círculo).

## Flujo de la app

```
Login (Google)
    └─ Mis círculos
           └─ Círculo (Hogar, Viaje, …)
                  ├─ Gastos  → periodos → gasto / balance / resumen
                  ├─ Listas  → ítems → comprados → nuevo gasto
                  ├─ Tareas  → pendientes / hechas (+ Calendar opcional)
                  └─ Personas
```

Un **círculo** concentra personas, categorías de gasto, listas y tareas. Los **periodos** son carpetas de gastos dentro del círculo (mes, viaje, etc.).

## Stack

| Capa | Tecnología |
|------|------------|
| Front | HTML / CSS / JS (multi-página, sin build) |
| Hosting | GitHub Pages |
| Backend | [Supabase](https://supabase.com) (Auth, Postgres, Realtime, Edge Functions) |
| Íconos | Heroicons |

## Estructura del repo

```
├── index.html              # Login + lista de círculos + accesos directos
├── circulo.html            # Hub del círculo (Gastos / Listas / Tareas / Personas)
├── gastos.html             # Periodo: gastos, balance, resumen
├── listas.html             # Listas de compras + cargar a gastos
├── tareas.html             # Tareas del círculo
├── manifest.webmanifest
├── sw.js                   # Service worker (PWA)
├── css/shared.css
├── js/
│   ├── supabase-client.js  # URL + anon key + APP_BASE_URL
│   ├── auth.js
│   ├── utils.js            # tema, modales, montos, accesos, Calendar helpers
│   ├── gasto-form.js       # formulario de gasto compartido (gastos + listas)
│   └── listas-plantillas.js
├── icons/
└── migrations/             # SQL + Edge Function (Calendar)
```

## Setup

### 1. Supabase

1. Creá un proyecto y habilitá **Google** en Authentication → Providers.
2. Aplicá el schema limpio (recomendado en proyectos nuevos):

   ```text
   migrations/migracion_9_schema_limpio.sql
   ```

   Si venís de versiones viejas, revisá las migraciones `1`–`8` en orden o partí de la `9` en un proyecto limpio.
3. (Opcional) Realtime: publicá la tabla `gastos` para ver cambios en vivo en un periodo abierto.
4. Copiá Project URL y **anon** key a `js/supabase-client.js`.
5. Ajustá `APP_BASE_URL` a tu URL de Pages (redirect OAuth).

### 2. GitHub Pages

1. Publicá este repo (o la carpeta raíz de la app) en Pages.
2. En Supabase → Authentication → URL Configuration, agregá esa URL a Redirect URLs.
3. Abrí la app, logueate y creá un círculo.

### 3. Google Calendar (opcional)

Solo hace falta si querés eventos al poner vencimiento en tareas.

1. En Google Cloud: Calendar API + scope `calendar.events` en el cliente OAuth que usa Supabase.
2. Edge Function: deployá el código de `migrations/edge-function-calendar-sync.ts` (el slug desplegado debe coincidir con el que llama `js/utils.js`, hoy `clever-api`).
3. Secrets de la function: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. SQL: `migrations/migracion_4_calendar_sync.sql` (tabla `google_tokens` y columnas en `tareas`) si no están en tu schema.
5. Los usuarios deben **reconectar Calendar** (o re-loguearse con consentimiento) para guardar el refresh token.

El evento se crea en el calendario de quien está logueado; si el asignado tiene email, se lo invita al evento.

## Modelo de datos (resumen)

| Tabla | Rol |
|-------|-----|
| `circulos` / `circulos_miembros` | Espacio compartido y membresía |
| `participantes` | Personas del círculo (nombre, email opcional) |
| `periodos` | Carpetas de gastos |
| `gastos` / `gastos_participantes` | Gastos y splits |
| `listas` / `lista_compras` | Listas e ítems |
| `tareas` | Tareas (+ Calendar opcional) |
| `google_tokens` | Refresh token de Calendar por usuario |

Políticas RLS: acceso por membresía del círculo (e invitados por email donde aplica).

## Desarrollo local

No hay build. Podés abrir los HTML con un server estático desde la raíz del repo, o trabajar contra Pages.

```bash
# ejemplo
npx serve .
```

Tras cambios en CSS/JS, subí el bump de `CACHE` en `sw.js` para que la PWA no sirva assets viejos.

## Seguridad (notas)

- En el front solo va la clave **anon**; la autorización real es **RLS**.
- No expongas la `service_role` en el cliente.
- Los `confirm` nativos del browser se reemplazaron por un modal propio (`torisConfirm`); los `alert` de validación/error siguen siendo nativos por ahora.

## Licencia

Uso personal / proyecto propio. Si publicás un fork, respetá los términos de Supabase, Google OAuth y Heroicons.
