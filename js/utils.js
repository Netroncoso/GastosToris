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

function abrirModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function cerrarModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// Actualiza ?abrir= en la URL sin recargar (permite refrescar dentro de un grupo)
function setQueryParam(key, value) {
    const url = new URL(window.location.href);
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
    history.replaceState(null, '', url);
}

// cambiarTab: busca el contenedor de contenido `tab-<nombre>` y activa la pestaña
// También invoca una función global opcional `onTab_<nombre>` si existe.
function cambiarTab(nombre) {
    document.querySelectorAll('.tab').forEach(t => {
        try { t.classList.toggle('active', t.textContent.toLowerCase().includes(nombre)); } catch (e) {}
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('tab-' + nombre);
    if (el) el.classList.add('active');
    const cb = window['onTab_' + nombre];
    if (typeof cb === 'function') cb();
}

// Generador genérico para sincronizar invitados entre tablas de personas y tabla de miembros
// `tipo` (opcional) acota a grupos de gastos o de tareas: como `participantes` y `grupos_miembros`
// son compartidos por ambos módulos, sin este filtro cada página repite el trabajo de la otra.
async function syncInvitados({ personsTable, personGroupField, membershipTable, membershipGroupField, tipo }) {
    // La membresía a un grupo casi no cambia durante una sesión: evitamos repetir
    // este sync (3 round-trips) en cada carga de pantalla, solo 1 vez por pestaña.
    const cacheKey = `_synced_invitados_${tipo || 'default'}`;
    if (sessionStorage.getItem(cacheKey)) return;

    const user = await getCurrentUser();
    const email = user?.email?.trim().toLowerCase();
    if (!email || !user?.id) return;
    sessionStorage.setItem(cacheKey, '1');

    const [q, gt] = await Promise.all([
        db.from(personsTable).select(personGroupField).eq('email', email),
        tipo ? db.from('grupos').select('id').eq('tipo', tipo) : Promise.resolve({ data: null })
    ]);
    if (q.error) return;

    let grupos = [...new Set((q.data || []).map(p => p[personGroupField]))];
    if (tipo) {
        const idsValidos = new Set((gt.data || []).map(g => g.id));
        grupos = grupos.filter(id => idsValidos.has(id));
    }
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

// =============================================
// FACTORY: GESTOR DE GRUPOS (creación/edición/abrir modal)
// =============================================
function crearGestorDeGrupos({ table, nameField = 'nombre', rpcCreate }) {
    return {
        abrirModalGrupo: function(grupo = null, modalId = 'modal-grupo', inputId = 'input-nombre-grupo') {
            window.grupoEditando = grupo;
            const val = grupo ? grupo[nameField] : '';
            const hdr = grupo ? 'Editar Grupo' : 'Nuevo Grupo';
            const btnText = grupo ? 'Actualizar Grupo' : 'Crear Grupo';
            const headerEl = document.querySelector('#' + modalId + ' .modal-header h3');
            if (headerEl) headerEl.textContent = hdr;
            const btn = document.querySelector('#' + modalId + ' .btn-primary');
            if (btn) btn.textContent = btnText;
            const inp = document.getElementById(inputId);
            if (inp) inp.value = val;
            abrirModal(modalId);
            setTimeout(() => inp?.focus(), 100);
        },

        crearGrupo: async function(modalId = 'modal-grupo', inputId = 'input-nombre-grupo') {
            const nombre = document.getElementById(inputId).value.trim();
            if (!nombre) { alert('Ingresá un nombre.'); return; }
            const userId = await getCurrentUserId();
            if (!userId) { alert('No se encontró el usuario actual. Volvé a iniciar sesión.'); return; }

            if (window.grupoEditando) {
                const { error } = await db.from(table).update({ [nameField]: nombre }).eq('id', window.grupoEditando.id);
                if (error) { alert('Error al actualizar grupo: ' + error.message); return; }
                window.grupoEditando = null;
                cerrarModal(modalId);
                if (typeof window.cargarGrupos === 'function') window.cargarGrupos();
                return;
            }

            const { data: grupo, error } = await db.rpc(rpcCreate, { p_nombre: nombre });
            if (error) { alert('Error al crear grupo: ' + error.message); return; }

            // Agregar al creador como persona (tabla `participantes`, compartida por gastos y tareas)
            const user = await getCurrentUser();
            if (user?.email) {
                try {
                    await db.from('participantes').insert({ id_grupo: grupo.id, nombre: getDisplayNameFromUser(user), email: user.email.toLowerCase() });
                } catch (e) { console.warn('No se pudo agregar al creador como persona:', e.message); }
            }

            cerrarModal(modalId);
            if (typeof window.cargarGrupos === 'function') window.cargarGrupos();
        }
    };
}

// =============================================
// FACTORY: GESTOR DE PERSONAS (añadir e invitar)
// =============================================
function crearGestorDePersonas({ table, nameField = 'nombre', groupField, inputNameId, inputEmailId, inviteInfoId, addButtonSelector, currentListVar, redirectParam }) {
    return {
        agregarPersona: async function(groupId) {
            const nombre = document.getElementById(inputNameId).value.trim();
            const email  = document.getElementById(inputEmailId).value.trim().toLowerCase();
            if (!nombre) { alert('Ingresá un nombre.'); return; }

            const currentList = window[currentListVar] || [];
            const nombreDup = currentList.find(p => (p[nameField] || '').toLowerCase() === nombre.toLowerCase());
            if (nombreDup) { alert(`Ya existe "${nombre}" en este grupo.`); return; }
            if (email) {
                const emailDup = currentList.find(p => p.email?.toLowerCase() === email);
                if (emailDup) { alert(`El email ${email} ya está registrado en este grupo (${emailDup[nameField]}).`); return; }
            }

            const payload = { [groupField]: groupId, [nameField]: nombre };
            if (email) payload.email = email;

            const { error } = await db.from(table).insert(payload);
            if (error) { alert('Error: ' + error.message); return; }

            if (email) {
                const user = await getCurrentUser();
                if (user?.email?.toLowerCase() === email) {
                    alert(`${nombre} fue agregado, pero no se envió invitación: ese es tu propio email.`);
                    if (inviteInfoId) document.getElementById(inviteInfoId).style.display = 'none';
                    if (addButtonSelector) document.querySelector(addButtonSelector).textContent = addButtonSelector.includes('modal') ? 'Agregar' : 'Agregar Persona';
                    if (typeof window.cargarParticipantes === 'function') window.cargarParticipantes();
                    if (typeof window.cargarPersonasTareas === 'function') window.cargarPersonasTareas();
                    return;
                }

                const { error: inviteError } = await db.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: `${APP_BASE_URL}?${redirectParam}=${groupId}`, shouldCreateUser: true }
                });
                if (inviteError) {
                    alert(`${nombre} fue agregado, pero hubo un error al enviar la invitación: ${inviteError.message}`);
                } else {
                    alert(`✅ ${nombre} fue agregado y se le envió una invitación a ${email}.`);
                }
            }

            // Reset form and reload
            if (inputNameId) document.getElementById(inputNameId).value = '';
            if (inputEmailId) document.getElementById(inputEmailId).value = '';
            if (inviteInfoId) document.getElementById(inviteInfoId).style.display = 'none';
            if (addButtonSelector) {
                const btn = document.querySelector(addButtonSelector);
                if (btn) btn.textContent = addButtonSelector.includes('modal') ? 'Agregar' : 'Agregar Persona';
            }

            if (typeof window.cargarParticipantes === 'function') window.cargarParticipantes();
            if (typeof window.cargarPersonasTareas === 'function') window.cargarPersonasTareas();
        }
    };
}
