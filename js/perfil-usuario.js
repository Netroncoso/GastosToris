// =============================================
// PERFIL / PREFERENCIAS (Supabase + cache local)
// =============================================

window._perfilSyncing = false;
let _perfilSaveTimer = null;
let _perfilPending = null;

function getAvatarUrlFromUser(user) {
    if (!user?.user_metadata) return null;
    return user.user_metadata.avatar_url || user.user_metadata.picture || null;
}

function pintarTopbarUser(user, perfil) {
    const el = document.getElementById('topbar-user');
    if (!el || !user) return;
    const nombre = (perfil?.display_name && String(perfil.display_name).trim())
        || (typeof getDisplayNameFromUser === 'function' ? getDisplayNameFromUser(user) : 'Usuario');
    const avatar = getAvatarUrlFromUser(user);
    if (avatar) {
        el.innerHTML = `<span class="topbar-user-inner"><img class="topbar-user-avatar" src="${escapeHtml(avatar)}" alt="" width="28" height="28" referrerpolicy="no-referrer" decoding="async"><span class="topbar-user-name">${escapeHtml(nombre)}</span></span>`;
    } else {
        el.textContent = nombre;
    }
}

function schedulePerfilSave(userId, patch) {
    if (!userId || window._perfilSyncing) return;
    _perfilPending = { userId, ...(_perfilPending || {}), ...patch };
    clearTimeout(_perfilSaveTimer);
    _perfilSaveTimer = setTimeout(() => flushPerfilSave().catch(() => {}), 600);
}

async function flushPerfilSave() {
    const pending = _perfilPending;
    _perfilPending = null;
    if (!pending?.userId) return;
    const row = {
        id: pending.userId,
        updated_at: new Date().toISOString()
    };
    if (pending.tema != null) row.tema = pending.tema;
    if (pending.accesos != null) row.accesos = pending.accesos;
    if (pending.display_name !== undefined) row.display_name = pending.display_name;
    const { error } = await db.from('perfiles').upsert(row, { onConflict: 'id' });
    if (error) console.warn('No se pudo guardar el perfil:', error.message);
}

function readLocalAccesosRaw(userId) {
    if (!userId) return null;
    try {
        const raw = localStorage.getItem(`${ACCESOS_STORAGE}:${userId}`);
        if (!raw) return null;
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : null;
    } catch (_) {
        return null;
    }
}

async function syncPerfilUsuario(user) {
    if (!user?.id) return null;
    window._perfilSyncing = true;
    try {
        const { data: row, error } = await db.from('perfiles')
            .select('id, display_name, tema, accesos, updated_at')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.warn('Perfil no disponible:', error.message);
            return null;
        }

        const localTemaRaw = localStorage.getItem('toris-theme');
        const localAccesosRaw = readLocalAccesosRaw(user.id);

        if (!row) {
            const tema = localTemaRaw === 'dark' || localTemaRaw === 'light' ? localTemaRaw : 'system';
            const accesos = typeof getAccesos === 'function' ? getAccesos(user.id) : (localAccesosRaw || []);
            const { error: insErr } = await db.from('perfiles').upsert({
                id: user.id,
                tema,
                accesos,
                display_name: null,
                updated_at: new Date().toISOString()
            });
            if (insErr) console.warn('No se pudo crear perfil:', insErr.message);
            if (tema === 'light' || tema === 'dark') applyTheme(tema, { skipPerfil: true });
            return { display_name: null, tema, accesos };
        }

        const serverAccesos = Array.isArray(row.accesos) ? row.accesos : [];
        const localHas = localAccesosRaw && localAccesosRaw.length > 0;
        const serverHas = serverAccesos.length > 0;

        if (!serverHas && localHas) {
            const accesos = getAccesos(user.id);
            await db.from('perfiles').update({
                accesos,
                updated_at: new Date().toISOString()
            }).eq('id', user.id);
        } else if (serverHas) {
            saveAccesos(user.id, serverAccesos);
        }

        const tema = row.tema || 'system';
        if (tema === 'light' || tema === 'dark') {
            applyTheme(tema, { skipPerfil: true });
        } else if (localTemaRaw !== 'light' && localTemaRaw !== 'dark') {
            const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(dark ? 'dark' : 'light', { skipPerfil: true });
        }

        return row;
    } finally {
        window._perfilSyncing = false;
    }
}
