// =============================================
// UTILS COMPARTIDOS
// =============================================

// Tema: aplicar lo antes posible (utils carga en <head> o al inicio del body)
(function initThemeEarly() {
    try {
        const saved = localStorage.getItem('toris-theme');
        const dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();

function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('toris-theme', next); } catch (_) {}
    // Misma tinta que el topbar (arriba del notch / chrome del celu)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#1b4079');
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        const icon = next === 'dark' ? 'sun' : 'moon';
        btn.setAttribute('title', next === 'dark' ? 'Modo claro' : 'Modo oscuro');
        btn.setAttribute('aria-label', next === 'dark' ? 'Modo claro' : 'Modo oscuro');
        btn.innerHTML = `<i data-icon="${icon}" data-size="18"></i>`;
        if (typeof initIconsIn === 'function') initIconsIn(btn);
    });
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', () => applyTheme(getTheme()));
function fmt(n) {
    // Formato ARS: separador de miles = punto, decimal = coma, sin decimales si es entero
    const num = Number(n);
    if (num % 1 === 0) return num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parsea monto escrito (es-AR: 1.234,56) a número. */
function parseMonto(val) {
    if (val == null || val === '') return NaN;
    let s = String(val).replace(/[^\d,.-]/g, '').replace(/\s/g, '');
    if (!s || s === '-' || s === ',') return NaN;
    if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        const dots = (s.match(/\./g) || []).length;
        if (dots > 1) s = s.replace(/\./g, '');
        else if (dots === 1) {
            const [a, b] = s.split('.');
            if (b && b.length === 3 && a.length <= 3) s = a + b;
        }
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
}

/** Formatea número para mostrar en un input de monto (es-AR). */
function formatMontoInput(n) {
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n % 1) < 1e-9) return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formatea texto mientras el usuario escribe (miles con punto, decimales con coma). */
function formatMontoLive(raw) {
    let cleaned = String(raw).replace(/[^\d,]/g, '');
    const commaIdx = cleaned.indexOf(',');
    let intPart, decPart;
    if (commaIdx >= 0) {
        intPart = cleaned.slice(0, commaIdx).replace(/\D/g, '');
        decPart = cleaned.slice(commaIdx + 1).replace(/\D/g, '').slice(0, 2);
    } else {
        intPart = cleaned.replace(/\D/g, '');
        decPart = null;
    }
    if (!intPart && decPart == null) return '';
    const n = parseInt(intPart || '0', 10);
    let result = n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
    if (commaIdx >= 0) result += ',' + (decPart ?? '');
    return result;
}

function setMontoInput(el, n) {
    if (!el) return;
    el.value = Number.isFinite(n) ? formatMontoInput(n) : '';
}

/**
 * Rellena el resto del total en la división.
 * - 2 personas: siempre actualiza el otro (corrige mientras escribís).
 * - 3+: actualiza el único vacío o el marcado data-auto-resto.
 */
function aplicarRestoSplit({ total, participantes, changedId, getInput }) {
    if (!(total > 0) || !participantes?.length || participantes.length < 2) return;
    const changed = getInput(changedId);
    if (changed) delete changed.dataset.autoResto;

    const others = participantes.filter(p => Number(p.id) !== Number(changedId));

    if (participantes.length === 2) {
        const other = others[0];
        const otherEl = other && getInput(other.id);
        if (!otherEl) return;
        const current = parseMonto(changed?.value) || 0;
        const resto = Math.max(0, Math.round((total - current) * 100) / 100);
        setMontoInput(otherEl, resto);
        otherEl.dataset.autoResto = '1';
        return;
    }

    const targets = others.filter(p => {
        const inp = getInput(p.id);
        const v = parseMonto(inp?.value);
        return inp?.dataset.autoResto === '1' || !(v > 0);
    });
    if (targets.length !== 1) return;

    let suma = 0;
    participantes.forEach(p => {
        if (Number(p.id) === Number(targets[0].id)) return;
        suma += parseMonto(getInput(p.id)?.value) || 0;
    });
    const targetEl = getInput(targets[0].id);
    if (!targetEl) return;
    setMontoInput(targetEl, Math.max(0, Math.round((total - suma) * 100) / 100));
    targetEl.dataset.autoResto = '1';
}

/** Enlaza formateo de monto en un input (type=text, inputmode=decimal). */
function bindMontoInput(el, onChange) {
    if (!el || el.dataset.montoBound) return;
    el.dataset.montoBound = '1';
    el.type = 'text';
    el.inputMode = 'decimal';
    el.autocomplete = 'off';
    el.addEventListener('input', () => {
        const pos = el.selectionStart;
        const oldLen = el.value.length;
        const formatted = formatMontoLive(el.value);
        el.value = formatted;
        try {
            const newPos = Math.max(0, pos + (formatted.length - oldLen));
            el.setSelectionRange(newPos, newPos);
        } catch (_) {}
        const n = parseMonto(formatted);
        if (onChange) onChange(Number.isFinite(n) ? n : 0);
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
// ÍCONOS (Phosphor regular vía CDN; logo Toris sigue en Heroicons)
// Coloreados con currentColor usando CSS mask
// =============================================
const PHOSPHOR_BASE = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular';
const HEROICONS_BASE = 'https://cdn.jsdelivr.net/npm/heroicons@2.2.0/24/outline';
/** Logo de la app: no migrar a Phosphor. */
const HEROICON_KEEP = new Set(['cube-transparent']);
/** Alias Heroicons (y nombres viejos) → Phosphor, p.ej. categorías ya guardadas en DB. */
const ICON_ALIAS = {
    'arrow-right-on-rectangle': 'sign-out',
    'x-mark': 'x',
    'pencil-square': 'pencil-simple',
    'chevron-up': 'caret-up',
    'chevron-down': 'caret-down',
    bookmark: 'bookmark-simple',
    'bookmark-slash': 'push-pin-slash',
    'cog-6-tooth': 'gear-six',
    'calendar-days': 'calendar-blank',
    'clipboard-document-list': 'clipboard-text',
    'arrow-path': 'arrows-clockwise',
    'arrow-path-rounded-square': 'arrows-counter-clockwise',
    sparkles: 'sparkle',
    scale: 'scales',
    home: 'house',
    bolt: 'lightning',
    film: 'film-strip',
    'archive-box': 'package',
    beaker: 'flask',
    'building-storefront': 'storefront',
    'device-phone-mobile': 'device-mobile',
    'musical-note': 'music-note',
    'paper-airplane': 'paper-plane-tilt',
    'airplane-tilt': 'paper-plane-tilt',
    truck: 'car',
    heart: 'cat',
    cake: 'cow',
    'shopping-bag': 'carrot',
    map: 'map-trifold',
    globe: 'island'
};
function resolveIconName(name) {
    if (!name) return 'package';
    return ICON_ALIAS[name] || name;
}
function iconUrl(name) {
    const resolved = resolveIconName(name);
    if (HEROICON_KEEP.has(resolved)) return `${HEROICONS_BASE}/${resolved}.svg`;
    return `${PHOSPHOR_BASE}/${resolved}.svg`;
}
function icon(name, size = 20) {
    const url = iconUrl(name);
    return `<span class="hicon" aria-hidden="true" style="width:${size}px;height:${size}px;-webkit-mask-image:url(${url});mask-image:url(${url})"></span>`;
}

/** Loader accesible para contenido async. */
function loaderHtml(text = 'Cargando…') {
    return `<div class="loader" role="status" aria-live="polite">${escapeHtml(text)}</div>`;
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
        body: JSON.stringify({
            ...payload,
            provider_token: session.provider_token || undefined
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al sincronizar con Google Calendar.');
    return data;
}

async function guardarTokenGoogleIfPresent(session) {
    if (!session?.user?.id) return false;
    const refreshToken = session.provider_refresh_token;
    if (!refreshToken) return false;
    const { error } = await db.rpc('guardar_google_token', { p_refresh_token: refreshToken });
    if (error) {
        console.error('No se pudo guardar el token de Google Calendar:', error.message);
        return false;
    }
    return true;
}

/** Tras OAuth, provider_refresh_token solo viene en SIGNED_IN (no en recargas). */
async function capturarTokenGoogleAlIniciarSesion(event, session) {
    if (event !== 'SIGNED_IN' || !session) return;
    if (await guardarTokenGoogleIfPresent(session)) return;
    // A veces el token llega un tick después de parsear el hash OAuth
    await new Promise(r => setTimeout(r, 400));
    const { data: { session: s2 } } = await db.auth.getSession();
    await guardarTokenGoogleIfPresent(s2);
}

async function intentarCapturarTokenGooglePostOAuth() {
    if (!window.location.hash.includes('access_token')) return;
    const { data: { session } } = await db.auth.getSession();
    if (session) await capturarTokenGoogleAlIniciarSesion('SIGNED_IN', session);
}

async function tieneCalendarConectado() {
    const { data, error } = await db.rpc('tiene_calendar_conectado');
    return !error && data === true;
}

/** OAuth opt-in para Calendar (no afecta el login diario). */
async function conectarGoogleCalendar() {
    try {
        localStorage.setItem('toris-last-route', window.location.pathname + window.location.search);
        sessionStorage.setItem('toris-calendar-oauth', '1');
    } catch (_) {}
    const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.href.split('#')[0],
            scopes: 'https://www.googleapis.com/auth/calendar.events',
            queryParams: { access_type: 'offline', prompt: 'consent' }
        }
    });
    if (error) alert('Error al conectar Calendar: ' + error.message);
}

/** Antes de sync: si Calendar no está listo, preguntar opt-in. false = no sync (tarea ya guardada). */
async function asegurarCalendarParaSync() {
    if (await tieneCalendarConectado()) return true;
    const { data: { session } } = await db.auth.getSession();
    if (session?.provider_token) return true;
    const ok = await torisConfirm({
        title: 'Google Calendar',
        message: '¿Conectar Google Calendar para agregar el vencimiento al calendario?',
        confirmLabel: 'Conectar'
    });
    if (ok) await conectarGoogleCalendar();
    return false;
}

function esErrorCalendarDesconectado(msg) {
    const m = String(msg || '').toLowerCase();
    return (
        m.includes('calendar conectado') ||
        m.includes('calendar expiró') ||
        m.includes('no tenés google calendar') ||
        m.includes('invalid_grant') ||
        m.includes('invalid_client') ||
        m.includes('oauth client was not found') ||
        m.includes('renovar el token') ||
        m.includes('expired or revoked')
    );
}

async function manejarErrorCalendar(e, contexto) {
    console.warn('Calendar sync:', e?.message);
    if (esErrorCalendarDesconectado(e?.message)) {
        if (await torisConfirm({
            title: 'Google Calendar',
            message: 'La tarea se guardó, pero Calendar no sincronizó. ¿Conectar Google Calendar ahora?',
            confirmLabel: 'Conectar'
        })) {
            await conectarGoogleCalendar();
        }
        return;
    }
    alert(`${contexto}: ${e.message}`);
}

// =============================================
// NAVEGACIÓN, MODALES Y UTILIDADES COMPARTIDAS
// =============================================
function mostrarPantalla(nombre) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + nombre);
    if (el) el.classList.add('active');
}

/** Sincroniza el overlay de modales con el viewport visible (sube con el teclado). */
let _vvSyncRaf = null;
function syncVisualViewport() {
    if (_vvSyncRaf) return;
    _vvSyncRaf = requestAnimationFrame(() => {
        _vvSyncRaf = null;
        const root = document.documentElement;
        const vv = window.visualViewport;
        if (!vv) {
            root.style.setProperty('--vv-top', '0px');
            root.style.setProperty('--vv-left', '0px');
            root.style.setProperty('--vv-width', '100%');
            root.style.setProperty('--vv-height', '100dvh');
            return;
        }
        root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
        root.style.setProperty('--vv-left', `${Math.round(vv.offsetLeft)}px`);
        root.style.setProperty('--vv-width', `${Math.round(vv.width)}px`);
        root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
    });
}

let _modalFocusStack = [];

function setupModalA11y(overlay) {
    const modal = overlay?.querySelector('.modal');
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const title = modal.querySelector('.modal-header h3');
    if (title && !title.id) title.id = `${overlay.id}-title`;
    if (title?.id) modal.setAttribute('aria-labelledby', title.id);
}

function getModalFocusables(modal) {
    return [...modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )].filter(el => !el.closest('[hidden]') && el.getAttribute('aria-hidden') !== 'true');
}

function abrirModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!document.querySelector('.modal-overlay.open')) {
        _modalFocusStack.push(document.activeElement);
    }
    syncVisualViewport();
    setupModalA11y(el);
    el.classList.add('open');
    document.body.classList.add('modal-open');
    const modal = el.querySelector('.modal');
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (modal && !isCoarse) {
        const focusables = getModalFocusables(modal);
        const target = focusables.find(f => !f.classList.contains('modal-close')) || focusables[0];
        if (target) setTimeout(() => target.focus(), 50);
    }
}

/** Handlers opcionales al cerrar un modal (stack / volver al anterior). */
const _modalCloseHandlers = Object.create(null);

function setModalCloseHandler(id, fn) {
    if (!id) return;
    if (typeof fn === 'function') _modalCloseHandlers[id] = fn;
    else delete _modalCloseHandlers[id];
}

function cerrarModal(id) {
    if (id && typeof _modalCloseHandlers[id] === 'function') {
        _modalCloseHandlers[id]();
        return;
    }
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) {
        document.body.classList.remove('modal-open');
        const prev = _modalFocusStack.pop();
        if (prev?.focus) prev.focus();
    }
}

/** Cierra el overlay sin invocar el handler de stack (uso interno de los wrappers). */
function cerrarModalRaw(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) {
        document.body.classList.remove('modal-open');
        const prev = _modalFocusStack.pop();
        if (prev?.focus) prev.focus();
    }
}

function handleModalKeydown(e) {
    const open = [...document.querySelectorAll('.modal-overlay.open')];
    if (!open.length) return;
    const overlay = open[open.length - 1];
    if (e.key === 'Escape') {
        e.preventDefault();
        if (overlay.id === 'modal-toris-confirm') {
            document.getElementById('toris-confirm-cancel')?.click();
        } else {
            cerrarModal(overlay.id);
        }
        return;
    }
    if (e.key !== 'Tab') return;
    const modal = overlay.querySelector('.modal');
    if (!modal) return;
    const focusables = getModalFocusables(modal);
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

document.addEventListener('keydown', handleModalKeydown);

/** Cerrar modal al tocar el fondo (fuera del panel). */
document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (!t.classList.contains('modal-overlay') || !t.classList.contains('open')) return;
    if (t.id === 'modal-toris-confirm') {
        document.getElementById('toris-confirm-cancel')?.click();
        return;
    }
    if (t.id) cerrarModal(t.id);
});

/**
 * Confirmación con modal Toris (reemplaza window.confirm).
 * @returns {Promise<boolean>}
 */
function torisConfirm({
    title = 'TorisApp',
    message = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false
} = {}) {
    ensureTorisConfirmModal();
    const overlay = document.getElementById('modal-toris-confirm');
    const titleEl = document.getElementById('toris-confirm-title');
    const msgEl = document.getElementById('toris-confirm-message');
    const btnOk = document.getElementById('toris-confirm-ok');
    const btnCancel = document.getElementById('toris-confirm-cancel');

    titleEl.textContent = title;
    msgEl.textContent = message;
    btnOk.textContent = confirmLabel;
    btnCancel.textContent = cancelLabel;
    btnOk.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    btnCancel.className = 'btn btn-ghost';

    return new Promise(resolve => {
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            btnOk.onclick = null;
            btnCancel.onclick = null;
            cerrarModal('modal-toris-confirm');
            resolve(value);
        };
        btnOk.onclick = () => finish(true);
        btnCancel.onclick = () => finish(false);
        abrirModal('modal-toris-confirm');
        setTimeout(() => btnCancel.focus(), 50);
    });
}

function ensureTorisConfirmModal() {
    if (document.getElementById('modal-toris-confirm')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div id="modal-toris-confirm" class="modal-overlay modal-toris-confirm" style="z-index:300">
    <div class="modal" style="max-width:360px" role="dialog" aria-modal="true" aria-labelledby="toris-confirm-title">
        <div class="modal-header">
            <h3 id="toris-confirm-title">TorisApp</h3>
            <button type="button" class="modal-close" id="toris-confirm-x" aria-label="Cerrar"><i data-icon="x" data-size="14"></i></button>
        </div>
        <p id="toris-confirm-message" class="toris-confirm-message"></p>
        <div class="toris-confirm-actions">
            <button type="button" class="btn btn-ghost" id="toris-confirm-cancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="toris-confirm-ok">Confirmar</button>
        </div>
    </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('toris-confirm-x').onclick = () => {
        document.getElementById('toris-confirm-cancel')?.click();
    };
}

syncVisualViewport();
window.addEventListener('resize', syncVisualViewport);
if (window.visualViewport) {
    visualViewport.addEventListener('resize', syncVisualViewport);
}

// Solo modales altos (.modal-scroll-focus): reacomodar si el teclado tapa el campo
let _modalFocusScrollTimer = null;
document.addEventListener('focusin', (e) => {
    const field = e.target;
    const modal = field?.closest?.('.modal');
    if (!modal?.closest?.('.modal-overlay.open')) return;
    if (!modal.classList.contains('modal-scroll-focus')) return;
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(field.tagName)) return;

    const body = modal.querySelector('.modal-body') || modal;
    clearTimeout(_modalFocusScrollTimer);
    _modalFocusScrollTimer = setTimeout(() => {
        const vv = window.visualViewport;
        const rect = field.getBoundingClientRect();
        const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        if (rect.bottom <= viewBottom - 8) return;

        const bodyRect = body.getBoundingClientRect();
        body.scrollTop = Math.max(0, rect.top - bodyRect.top + body.scrollTop - 24);
    }, 120);
});

/** Evita doble submit: deshabilita el botón mientras corre la acción. */
async function withBusyButton(btnOrSelector, fn) {
    const btn = typeof btnOrSelector === 'string'
        ? document.querySelector(btnOrSelector)
        : btnOrSelector;
    if (btn?.dataset.busy === '1') return;
    const prevText = btn?.textContent;
    if (btn) {
        btn.dataset.busy = '1';
        btn.disabled = true;
    }
    try {
        return await fn(btn, prevText);
    } finally {
        if (btn) {
            btn.dataset.busy = '';
            btn.disabled = false;
            if (prevText != null) btn.textContent = prevText;
        }
    }
}

function getQueryParam(key) {
    return new URLSearchParams(window.location.search).get(key);
}

// Actualiza query params sin recargar (permite F5 sin perder el lugar)
function setQueryParam(key, value) {
    const url = new URL(window.location.href);
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
    history.replaceState(null, '', url);
}

/** Setea varios query params de una vez (más estable que varios replaceState seguidos). */
function setQueryParams(map) {
    const url = new URL(window.location.href);
    Object.entries(map).forEach(([key, value]) => {
        if (value == null || value === '') url.searchParams.delete(key);
        else url.searchParams.set(key, String(value));
    });
    history.replaceState(null, '', url);
}

function clearDetailQueryParams() {
    setQueryParams({
        abrir: null, tab: null, filtro: null,
        circulo: null, periodo: null, seccion: null
    });
}

function irAlCirculo(id, seccion = null) {
    const q = new URLSearchParams({ abrir: String(id) });
    if (seccion) q.set('seccion', seccion);
    window.location.href = `./circulo.html?${q.toString()}`;
}

// =============================================
// ACCESOS DIRECTOS (localStorage por usuario)
// =============================================
const ACCESOS_STORAGE = 'toris-accesos';
const ACCESOS_MAX = 8;
/** Solo periodo concreto o lista concreta (no secciones del círculo). */
const ACCESOS_TIPOS = new Set(['gastos-periodo', 'lista']);

function accesosStorageKey(userId) {
    return `${ACCESOS_STORAGE}:${userId}`;
}

function getAccesos(userId) {
    if (!userId) return [];
    try {
        const raw = localStorage.getItem(accesosStorageKey(userId));
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        // Limpia pines viejos de sección (Gastos/Listas/Tareas/Personas) y tabs.
        const cleaned = list
            .filter(a => a && ACCESOS_TIPOS.has(a.tipo))
            .map(a => {
                if (a.tipo === 'gastos-periodo') {
                    const next = {
                        id: accesoIdFrom(a),
                        circuloId: Number(a.circuloId),
                        circuloNombre: a.circuloNombre || '',
                        tipo: 'gastos-periodo',
                        periodoId: Number(a.periodoId),
                        periodoNombre: a.periodoNombre || undefined,
                        label: buildAccesoLabel(a)
                    };
                    return next;
                }
                return {
                    id: accesoIdFrom(a),
                    circuloId: Number(a.circuloId),
                    circuloNombre: a.circuloNombre || '',
                    tipo: 'lista',
                    listaId: Number(a.listaId),
                    listaNombre: a.listaNombre || undefined,
                    label: buildAccesoLabel(a)
                };
            })
            .filter(a => a.tipo !== 'gastos-periodo' || a.periodoId)
            .filter(a => a.tipo !== 'lista' || a.listaId);
        // Deduplicar por id (p. ej. mismo periodo con tabs distintos).
        const seen = new Set();
        const deduped = cleaned.filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });
        if (JSON.stringify(deduped) !== JSON.stringify(list)) saveAccesos(userId, deduped);
        return deduped;
    } catch (_) {
        return [];
    }
}

function saveAccesos(userId, list) {
    if (!userId) return;
    try { localStorage.setItem(accesosStorageKey(userId), JSON.stringify(list)); } catch (_) {}
}

function accesoIdFrom(data) {
    return [
        data.circuloId,
        data.tipo,
        data.periodoId || '',
        data.listaId || ''
    ].join('-');
}

function buildAccesoLabel(data) {
    const circulo = data.circuloNombre || 'Círculo';
    if (data.tipo === 'gastos-periodo') return `${circulo} · ${data.periodoNombre || 'Periodo'}`;
    if (data.tipo === 'lista') return `${circulo} · ${data.listaNombre || 'Lista'}`;
    return circulo;
}

function accesoIcon(data) {
    if (data.tipo === 'gastos-periodo') return 'currency-dollar';
    if (data.tipo === 'lista') return 'shopping-cart';
    return 'cube-transparent';
}

function urlAcceso(acceso) {
    switch (acceso.tipo) {
        case 'gastos-periodo':
            return `./gastos.html?circulo=${acceso.circuloId}&periodo=${acceso.periodoId}`;
        case 'lista':
            return `./listas.html?circulo=${acceso.circuloId}&abrir=${acceso.listaId}`;
        default:
            return './index.html';
    }
}

function isAccesoPinned(userId, data) {
    const id = accesoIdFrom(data);
    return getAccesos(userId).some(a => a.id === id);
}

/** true = fijado, false = quitado, null = límite alcanzado */
function toggleAcceso(userId, data) {
    if (!userId || !data?.circuloId || !ACCESOS_TIPOS.has(data.tipo)) return null;
    const id = accesoIdFrom(data);
    const list = getAccesos(userId);
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) {
        list.splice(idx, 1);
        saveAccesos(userId, list);
        return false;
    }
    if (list.length >= ACCESOS_MAX) {
        alert(`Máximo ${ACCESOS_MAX} accesos directos. Quitá uno desde el inicio.`);
        return null;
    }
    const entry = {
        id,
        circuloId: Number(data.circuloId),
        circuloNombre: data.circuloNombre || '',
        tipo: data.tipo,
        label: buildAccesoLabel(data)
    };
    if (data.tipo === 'gastos-periodo') {
        entry.periodoId = Number(data.periodoId);
        entry.periodoNombre = data.periodoNombre || undefined;
    } else if (data.tipo === 'lista') {
        entry.listaId = Number(data.listaId);
        entry.listaNombre = data.listaNombre || undefined;
    }
    list.push(entry);
    saveAccesos(userId, list);
    return true;
}

function quitarAcceso(userId, accesoId) {
    const list = getAccesos(userId).filter(a => a.id !== accesoId);
    saveAccesos(userId, list);
}

function updateFabPinButton(btn, pinned) {
    if (!btn) return;
    btn.classList.toggle('pinned', !!pinned);
    const label = pinned ? 'Quitar del inicio' : 'Fijar en inicio';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<i data-icon="${pinned ? 'push-pin-slash' : 'bookmark-simple'}" data-size="22"></i>`;
    if (typeof initIconsIn === 'function') initIconsIn(btn);
}

const PIN_TIP_STORAGE = 'toris-pin-tip-seen';

function pinTipStorageKey(userId) {
    return `${PIN_TIP_STORAGE}:${userId || 'anon'}`;
}

function hasSeenPinTip(userId) {
    try { return localStorage.getItem(pinTipStorageKey(userId)) === '1'; } catch (_) { return true; }
}

function markPinTipSeen(userId) {
    try { localStorage.setItem(pinTipStorageKey(userId), '1'); } catch (_) {}
}

function hideFabPinTip() {
    document.getElementById('fab-pin-tip')?.remove();
}

async function dismissFabPinTip() {
    const userId = await getCurrentUserId();
    markPinTipSeen(userId);
    hideFabPinTip();
}

async function maybeShowFabPinTip() {
    const btn = document.getElementById('fab-pin');
    if (!btn || btn.classList.contains('hidden')) {
        hideFabPinTip();
        return;
    }
    const userId = await getCurrentUserId();
    if (hasSeenPinTip(userId)) {
        hideFabPinTip();
        return;
    }
    if (document.getElementById('fab-pin-tip')) return;

    const tip = document.createElement('div');
    tip.id = 'fab-pin-tip';
    tip.className = 'fab-pin-tip';
    tip.setAttribute('role', 'status');
    tip.innerHTML = `
        <div class="fab-pin-tip-text">Fijá este periodo o lista en inicio para abrirlo en un toque al volver a la app.</div>
        <button type="button" class="fab-pin-tip-close" onclick="dismissFabPinTip()" aria-label="Cerrar"><i data-icon="x" data-size="14"></i></button>
    `;
    document.body.appendChild(tip);
    if (typeof initIconsIn === 'function') initIconsIn(tip);
}

async function refreshFabPin(data) {
    const btn = document.getElementById('fab-pin');
    if (!btn) return;
    if (!data) {
        btn.classList.add('hidden');
        document.body.classList.remove('has-fab-pin');
        window._fabPinData = null;
        hideFabPinTip();
        return;
    }
    window._fabPinData = data;
    btn.classList.remove('hidden');
    document.body.classList.add('has-fab-pin');
    const userId = await getCurrentUserId();
    updateFabPinButton(btn, userId && isAccesoPinned(userId, data));
    maybeShowFabPinTip().catch(() => {});
}

async function togglePinPaginaActual() {
    const userId = await getCurrentUserId();
    const data = window._fabPinData;
    if (!userId || !data) return;
    const result = toggleAcceso(userId, data);
    if (result === null) return;
    updateFabPinButton(document.getElementById('fab-pin'), result);
    if (result === true) {
        markPinTipSeen(userId);
        hideFabPinTip();
    }
}

async function pintarAccesosEnIndex(userId) {
    const sec = document.getElementById('seccion-accesos');
    const cont = document.getElementById('lista-accesos');
    if (!sec || !cont) return;
    const list = getAccesos(userId);
    sec.classList.remove('hidden');
    if (!list.length) {
        cont.innerHTML = `
            <div class="acceso-empty">
                <div class="acceso-empty-icon" aria-hidden="true"><i data-icon="bookmark-simple" data-size="22"></i></div>
                <div class="acceso-empty-title">Accesos directos</div>
                <p class="acceso-empty-text">En un periodo o una lista, tocá el botón redondo de abajo a la derecha (mismo ícono) para fijarlo acá y abrirlo en un toque.</p>
            </div>`;
        if (typeof initIconsIn === 'function') initIconsIn(cont);
        return;
    }
    cont.innerHTML = `
        <div class="section-label" style="margin-top:0">Accesos directos</div>
        ${list.map(a => `
        <div class="card acceso-card">
            <div class="card-body flex-between card-click" style="gap:10px" onclick="abrirAccesoDirecto('${escapeJsString(a.id)}')">
                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
                    <div class="dash-icon" style="width:40px;height:40px"><i data-icon="${accesoIcon(a)}" data-size="22"></i></div>
                    <div style="min-width:0">
                        <div style="font-weight:600;font-size:15px;word-break:break-word">${escapeHtml(a.label || buildAccesoLabel(a))}</div>
                    </div>
                </div>
                <button type="button" class="acceso-unpin" onclick="event.stopPropagation();quitarAccesoDirecto('${escapeJsString(a.id)}')" title="Quitar del inicio" aria-label="Quitar del inicio"><i data-icon="push-pin-slash" data-size="16"></i></button>
            </div>
        </div>
    `).join('')}`;
}

function abrirAccesoDirecto(accesoId) {
    const userId = window._indexUserId;
    if (!userId) return;
    const acceso = getAccesos(userId).find(a => a.id === accesoId);
    if (acceso) window.location.href = urlAcceso(acceso);
}

async function quitarAccesoDirecto(accesoId) {
    const userId = window._indexUserId;
    if (!userId) return;
    quitarAcceso(userId, accesoId);
    await pintarAccesosEnIndex(userId);
}

/** Quita el splash de boot (llamar cuando la pantalla correcta ya está activa). */
function appReady() {
    document.body.classList.remove('app-booting');
}

/** Activa una pantalla sin animaciones intermedias (para restaurar F5). */
function bootScreen(nombre) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + nombre);
    if (el) el.classList.add('active');
}

function syncTabsUI(nombre) {
    document.querySelectorAll('.tab').forEach(t => {
        const tabName = t.getAttribute('data-tab') || (t.getAttribute('onclick') || '').match(/cambiarTab\('([^']+)'\)/)?.[1];
        const on = tabName === nombre;
        t.classList.toggle('active', on);
        if (t.getAttribute('role') === 'tab') {
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
        }
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('tab-' + nombre);
    if (el) el.classList.add('active');
}

/** Activa pestaña de contenido sin disparar side-effects (onTab_*). */
function bootTab(nombre) {
    syncTabsUI(nombre);
}

// cambiarTab: busca el contenedor `tab-<nombre>` y activa la pestaña.
// Persiste `tab` en la URL siempre que exista el contenido (para que F5 restaure).
function cambiarTab(nombre) {
    syncTabsUI(nombre);
    const el = document.getElementById('tab-' + nombre);
    if (el) setQueryParam('tab', nombre);
    const cb = window['onTab_' + nombre];
    if (typeof cb === 'function') cb();
    if (typeof window.onAfterTabChange === 'function') window.onAfterTabChange(nombre);
}

/** Sincroniza aria-selected en filter-tabs. */
function syncFilterTabsUI(container, activeName) {
    if (!container) return;
    container.querySelectorAll('.filter-tab').forEach(t => {
        const name = t.getAttribute('data-filtro') || (t.getAttribute('onclick') || '').match(/setFiltro\('([^']+)'\)/)?.[1];
        const on = name === activeName;
        t.classList.toggle('active', on);
        if (t.getAttribute('role') === 'tab') {
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
        }
    });
}

// Sincroniza invitados (participantes.email) → membresía en circulos_miembros. 1 vez por sesión.
async function syncInvitados({ personsTable = 'participantes', personGroupField = 'id_circulo', membershipTable = 'circulos_miembros', membershipGroupField = 'id_circulo' } = {}) {
    const cacheKey = '_synced_invitados_circulos';
    if (sessionStorage.getItem(cacheKey)) return;

    const user = await getCurrentUser();
    const email = user?.email?.trim().toLowerCase();
    if (!email || !user?.id) return;
    sessionStorage.setItem(cacheKey, '1');

    const { data, error } = await db.from(personsTable).select(personGroupField).eq('email', email);
    if (error) return;

    const grupos = [...new Set((data || []).map(p => p[personGroupField]).filter(Boolean))];
    if (!grupos.length) return;

    const rows = grupos.map(id_gr => ({ [membershipGroupField]: id_gr, user_id: user.id }));
    const { error: em } = await db.from(membershipTable).upsert(rows, { onConflict: [membershipGroupField, 'user_id'] });
    if (em && !em.message?.includes('duplicate')) console.warn('No se pudo sincronizar membresía invitada:', em.message);
}

// Inicializa íconos para elementos con `data-icon` (HTML estático Y contenido
// insertado dinámicamente vía innerHTML, ya que un MutationObserver vigila el DOM)
function initIcon(el) {
    const name = el.getAttribute('data-icon');
    const size = el.getAttribute('data-size') || 18;
    const url = iconUrl(name);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.webkitMaskImage = `url(${url})`;
    el.style.maskImage = `url(${url})`;
    el.classList.add('hicon');
    el.setAttribute('aria-hidden', 'true');
}

function pressableKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.currentTarget.click();
    }
}

function initPressablesIn(root) {
    if (root.nodeType !== 1) return;
    const pressableSel = '.card-click, .lista-check';
    if (root.matches?.(pressableSel)) bindPressable(root);
    root.querySelectorAll?.(pressableSel).forEach(bindPressable);
}

function bindPressable(el) {
    if (el.dataset.pressable) return;
    el.dataset.pressable = '1';
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.addEventListener('keydown', pressableKeydown);
}

function enhanceA11yIn(root) {
    if (root.nodeType !== 1) return;
    const q = (sel) => root.querySelectorAll?.(sel) || [];
    if (root.matches?.('.modal-close:not([aria-label])')) root.setAttribute('aria-label', 'Cerrar');
    q('.modal-close:not([aria-label])').forEach(b => b.setAttribute('aria-label', 'Cerrar'));
    q('.btn-icon[title]:not([aria-label]), .btn-icon-plain[title]:not([aria-label]), .fab-pin[title]:not([aria-label]), .acceso-unpin[title]:not([aria-label])').forEach(b => {
        b.setAttribute('aria-label', b.getAttribute('title'));
    });
    initPressablesIn(root);
}

function initIconsIn(root) {
    if (root.nodeType !== 1) return;
    try {
        if (root.matches('[data-icon]')) initIcon(root);
        root.querySelectorAll('[data-icon]').forEach(initIcon);
        enhanceA11yIn(root);
    } catch (err) {
        console.warn('initIconsIn:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initIconsIn(document.documentElement);
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        if (!btn.getAttribute('aria-label')) {
            const label = btn.getAttribute('title') || (getTheme() === 'dark' ? 'Modo claro' : 'Modo oscuro');
            btn.setAttribute('aria-label', label);
        }
    });
});

new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => initIconsIn(node)));
}).observe(document.documentElement, { childList: true, subtree: true });

// PWA: abre como app (sin pestaña nueva cada vez) y cachea estáticos
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// =============================================
// FACTORY: GESTOR DE GRUPOS (creación/edición/abrir modal)
// =============================================
function crearGestorDeGrupos({ table, nameField = 'nombre', rpcCreate }) {
    return {
        abrirModalGrupo: function(grupo = null, modalId = 'modal-grupo', inputId = 'input-nombre-grupo') {
            window.grupoEditando = grupo;
            const val = grupo ? grupo[nameField] : '';
            const hdr = grupo ? 'Editar círculo' : 'Nuevo círculo';
            const btnText = grupo ? 'Actualizar' : 'Crear círculo';
            const headerEl = document.querySelector('#' + modalId + ' .modal-header h3');
            if (headerEl) headerEl.textContent = hdr;
            const btn = document.querySelector('#' + modalId + ' .btn-primary');
            if (btn) {
                btn.textContent = btnText;
                btn.disabled = false;
                btn.dataset.busy = '';
            }
            const inp = document.getElementById(inputId);
            if (inp) inp.value = val;
            abrirModal(modalId);
            setTimeout(() => inp?.focus(), 100);
        },

        crearGrupo: async function(modalId = 'modal-grupo', inputId = 'input-nombre-grupo') {
            return withBusyButton('#' + modalId + ' .btn-primary', async () => {
                const nombre = document.getElementById(inputId).value.trim();
                if (!nombre) { alert('Ingresá un nombre.'); return; }
                const userId = await getCurrentUserId();
                if (!userId) { alert('No se encontró el usuario actual. Volvé a iniciar sesión.'); return; }

                if (window.grupoEditando) {
                    const { error } = await db.from(table).update({ [nameField]: nombre }).eq('id', window.grupoEditando.id);
                    if (error) { alert('Error al actualizar: ' + error.message); return; }
                    window.grupoEditando = null;
                    cerrarModal(modalId);
                    if (typeof window.cargarGrupos === 'function') window.cargarGrupos();
                    return;
                }

                const { data: grupo, error } = await db.rpc(rpcCreate || 'crear_circulo', { p_nombre: nombre });
                if (error) { alert('Error al crear círculo: ' + error.message); return; }

                // Cerrar ya: el resto no debe dejar el modal colgado
                document.getElementById(inputId).value = '';
                cerrarModal(modalId);

                const user = await getCurrentUser();
                if (user?.email) {
                    try {
                        await db.from('participantes').insert({
                            id_circulo: grupo.id,
                            nombre: getDisplayNameFromUser(user),
                            email: user.email.toLowerCase()
                        });
                    } catch (e) { console.warn('No se pudo agregar al creador como persona:', e.message); }
                }

                if (typeof window.cargarGrupos === 'function') window.cargarGrupos();
                return grupo;
            });
        }
    };
}

// =============================================
// FACTORY: GESTOR DE PERSONAS (añadir e invitar)
// =============================================
function crearGestorDePersonas({ table, nameField = 'nombre', groupField, inputNameId, inputEmailId, inviteInfoId, addButtonSelector, currentListVar, redirectParam = 'invite', modalId = 'modal-participante' }) {
    return {
        agregarPersona: async function(groupId) {
            return withBusyButton(addButtonSelector || '#' + modalId + ' .btn-primary', async (btn) => {
                const nombre = document.getElementById(inputNameId).value.trim();
                const email  = document.getElementById(inputEmailId).value.trim().toLowerCase();
                if (!nombre) { alert('Ingresá un nombre.'); return false; }

                const currentList = window[currentListVar] || [];
                const nombreDup = currentList.find(p => (p[nameField] || '').toLowerCase() === nombre.toLowerCase());
                if (nombreDup) { alert(`Ya existe "${nombre}" en este círculo.`); return false; }
                if (email) {
                    const emailDup = currentList.find(p => p.email?.toLowerCase() === email);
                    if (emailDup) { alert(`El email ${email} ya está registrado en este círculo (${emailDup[nameField]}).`); return false; }
                }

                const payload = { [groupField]: groupId, [nameField]: nombre };
                if (email) payload.email = email;

                const { data: inserted, error } = await db.from(table).insert(payload).select().single();
                if (error) {
                    if (error.code === '23505') alert('Esa persona o email ya existe en este círculo.');
                    else alert('Error: ' + error.message);
                    return false;
                }

                // Actualizar lista local ya (evita un segundo click antes del reload)
                if (inserted && Array.isArray(window[currentListVar])) {
                    window[currentListVar] = [...window[currentListVar], inserted];
                }

                // Cerrar modal YA — no esperar el OTP (eso es lo que dejaba todo tildado)
                if (inputNameId) document.getElementById(inputNameId).value = '';
                if (inputEmailId) document.getElementById(inputEmailId).value = '';
                if (inviteInfoId) document.getElementById(inviteInfoId).style.display = 'none';
                if (btn) btn.textContent = 'Agregar';
                cerrarModal(modalId);

                if (typeof window.cargarParticipantes === 'function') window.cargarParticipantes();
                if (typeof window.cargarPersonasTareas === 'function') window.cargarPersonasTareas();

                // Invitación en segundo plano
                if (email) {
                    const user = await getCurrentUser();
                    if (user?.email?.toLowerCase() === email) {
                        alert(`${nombre} fue agregado, pero no se envió invitación: ese es tu propio email.`);
                        return true;
                    }
                    const { error: inviteError } = await db.auth.signInWithOtp({
                        email,
                        options: { emailRedirectTo: `${APP_BASE_URL}?${redirectParam}=${groupId}`, shouldCreateUser: true }
                    });
                    if (inviteError) {
                        alert(`${nombre} fue agregado, pero hubo un error al enviar la invitación: ${inviteError.message}`);
                    } else {
                        alert(`${nombre} fue agregado y se le envió una invitación a ${email}.`);
                    }
                }
                return true;
            });
        }
    };
}
