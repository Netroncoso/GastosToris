// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'No se pudo renovar el token de Google. Puede que haya que volver a iniciar sesión.')
  }
  return data.access_token as string
}

function addOneHour(iso: string): string {
  const d = new Date(iso)
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    // Cliente "como el usuario", solo para validar quién llama
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sesión inválida' }, 401)

    const body = await req.json()
    const { action } = body

    // Cliente admin (service role) para leer el refresh token guardado
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: tokenRow, error: tokenError } = await admin
      .from('google_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenRow?.refresh_token) {
      return json({ error: 'No tenés Google Calendar conectado todavía. Cerrá sesión y volvé a iniciarla para autorizarlo.' }, 400)
    }

    const accessToken = await refreshAccessToken(tokenRow.refresh_token)

    if (action === 'create' || action === 'update') {
      const { titulo, fecha_vencimiento, descripcion, asignado_email, invitados_emails, event_id } = body
      if (!titulo || !fecha_vencimiento) {
        return json({ error: 'Falta título o fecha de vencimiento.' }, 400)
      }

      const event: Record<string, unknown> = {
        summary: titulo,
        description: descripcion || '',
        start: { dateTime: fecha_vencimiento },
        end: { dateTime: addOneHour(fecha_vencimiento) },
      }
      
      const attendees: { email: string }[] = []
      if (Array.isArray(invitados_emails)) {
        invitados_emails.forEach(email => {
          if (email) attendees.push({ email })
        })
      } else if (asignado_email) {
        attendees.push({ email: asignado_email })
      }

      if (attendees.length > 0) {
        event.attendees = attendees
      }

      const isUpdate = action === 'update' && event_id
      const url = isUpdate
        ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}?sendUpdates=all`
        : `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all`

      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: data.error?.message || 'Error al guardar el evento en Google Calendar' }, 500)
      return json({ event_id: data.id })
    }

    if (action === 'delete') {
      const { event_id } = body
      if (!event_id) return json({ ok: true }) // nada que borrar

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}?sendUpdates=all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      )
      // 410/404 = ya no existe en Google, lo tratamos como éxito igual
      if (!res.ok && res.status !== 410 && res.status !== 404) {
        const data = await res.json().catch(() => ({}))
        return json({ error: data.error?.message || 'Error al borrar el evento' }, 500)
      }
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
