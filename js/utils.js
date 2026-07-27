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

// =============================================
// NAVEGACIÓN, MODALES Y UTILIDADES COMPARTIDAS
// =============================================
function mostrarPantalla(nombre) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + nombre);
    if (el) el.classList.add('active');
}

/** Sincroniza el overlay de modales con el viewport visible (sube con el teclado). */
function syncVisualViewport() {
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
}

function abrirModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    syncVisualViewport();
    el.classList.add('open');
    document.body.classList.add('modal-open');
}

function cerrarModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) {
        document.body.classList.remove('modal-open');
    }
}

syncVisualViewport();
window.addEventListener('resize', syncVisualViewport);
if (window.visualViewport) {
    visualViewport.addEventListener('resize', syncVisualViewport);
    visualViewport.addEventListener('scroll', syncVisualViewport);
}

// Al enfocar un campo, reacomodar y traer el input a la zona visible sobre el teclado
document.addEventListener('focusin', (e) => {
    const field = e.target;
    if (!field?.closest?.('.modal-overlay.open')) return;
    const bringIntoView = () => {
        syncVisualViewport();
        field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    };
    bringIntoView();
    setTimeout(bringIntoView, 280);
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
    window.location.href = `circulo.html?${q.toString()}`;
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

/** Activa pestaña de contenido sin disparar side-effects (onTab_*). */
function bootTab(nombre) {
    document.querySelectorAll('.tab').forEach(t => {
        const tabName = t.getAttribute('data-tab') || (t.getAttribute('onclick') || '').match(/cambiarTab\('([^']+)'\)/)?.[1];
        t.classList.toggle('active', tabName === nombre);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('tab-' + nombre);
    if (el) el.classList.add('active');
}

// cambiarTab: busca el contenedor `tab-<nombre>` y activa la pestaña.
// Persiste `tab` en la URL siempre que exista el contenido (para que F5 restaure).
function cambiarTab(nombre) {
    document.querySelectorAll('.tab').forEach(t => {
        const tabName = t.getAttribute('data-tab') || (t.getAttribute('onclick') || '').match(/cambiarTab\('([^']+)'\)/)?.[1];
        t.classList.toggle('active', tabName === nombre);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('tab-' + nombre);
    if (el) {
        el.classList.add('active');
        setQueryParam('tab', nombre);
    }
    const cb = window['onTab_' + nombre];
    if (typeof cb === 'function') cb();
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
    const url = `${HEROICONS_BASE}/${name}.svg`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.webkitMaskImage = `url(${url})`;
    el.style.maskImage = `url(${url})`;
    el.classList.add('hicon');
}

function initIconsIn(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('[data-icon]')) initIcon(root);
    root.querySelectorAll('[data-icon]').forEach(initIcon);
}

document.addEventListener('DOMContentLoaded', () => initIconsIn(document.documentElement));

new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(initIconsIn));
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
