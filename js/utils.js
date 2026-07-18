// =============================================
// UTILS COMPARTIDOS
// =============================================
function fmt(n) {
    // Formato ARS: separador de miles = punto, decimal = coma, sin decimales si es entero
    const num = Number(n);
    if (num % 1 === 0) return num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Fecha de hoy en formato YYYY-MM-DD, en hora local (para el value de un <input type="date">)
function hoyISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
}

async function getCurrentUserId() {
    const { data: { session } } = await db.auth.getSession();
    return session?.user?.id || null;
}

async function getCurrentUser() {
    const { data: { session } } = await db.auth.getSession();
    return session?.user || null;
}

function getDisplayNameFromUser(user) {
    if (!user) return 'Usuario';
    const fullName = user.user_metadata?.full_name || user.email || '';
    const namePart = fullName.split(' ')[0].trim();
    if (namePart) return namePart;
    return user.email?.split('@')[0] || 'Usuario';
}

// =============================================
// ÍCONOS (Heroicons vía CDN, coloreados con currentColor usando CSS mask)
// =============================================
const HEROICONS_BASE = 'https://cdn.jsdelivr.net/npm/heroicons@2.2.0/24/outline';
function icon(name, size = 20) {
    const url = `${HEROICONS_BASE}/${name}.svg`;
    return `<span class="hicon" style="width:${size}px;height:${size}px;-webkit-mask-image:url(${url});mask-image:url(${url})"></span>`;
}

// Convierte un string "YYYY-MM-DD" (como lo guarda un <input type="date">) a un Date
// en hora LOCAL, evitando el corrimiento de día que da `new Date("YYYY-MM-DD")`
// (que lo interpreta como UTC medianoche y en Argentina muestra el día anterior).
function parseFechaLocal(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Formatea un timestamp ISO (con hora) a fecha+hora corta en es-AR
function formatFechaHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Llama a la Edge Function "calendar-sync" (crear/editar/borrar eventos de Google Calendar)
async function callCalendarSync(payload) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('No hay sesión activa.');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/clever-api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_KEY
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al sincronizar con Google Calendar.');
    return data;
}
