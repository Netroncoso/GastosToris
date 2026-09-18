// =============================================
// PERFIL / PREFERENCIAS (Supabase + cache local)
// =============================================

window._perfilSyncing = false;
let _perfilSaveTimer = null;
let _perfilPending = null;
let _topbarMenuDocListener = false;

function getAvatarUrlFromUser(user) {
    if (!user) return null;
    const m = user.user_metadata || {};
    if (m.avatar_url) return m.avatar_url;
    if (m.picture) return m.picture;
    for (const id of user.identities || []) {
        const d = id.identity_data || {};
        if (d.avatar_url) return d.avatar_url;
        if (d.picture) return d.picture;
    }
    return null;
}

async function fetchGoogleAvatarFromProviderToken() {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.provider_token;
    if (!token) return null;
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.picture || null;
    } catch (_) {
        return null;
    }
}

async function resolveAvatarUrl(user, perfil) {
    const { data: { user: fresh } } = await db.auth.getUser();
    const u = fresh || user;
    let url = getAvatarUrlFromUser(u);
    if (!url && perfil?.avatar_url) url = perfil.avatar_url;
    if (!url) url = await fetchGoogleAvatarFromProviderToken();
    if (url && u?.id && url !== perfil?.avatar_url) {
        schedulePerfilSave(u.id, { avatar_url: url });
    }
    return url;
}

function getFullDisplayNameForTopbar(user, perfil) {
    if (perfil?.display_name && String(perfil.display_name).trim()) {
        return String(perfil.display_name).trim();
    }
    const full = user?.user_metadata?.full_name;
    if (full && String(full).trim()) return String(full).trim();
    return user?.email?.split('@')[0] || 'Usuario';
}

function cacheSessionAvatar(user, avatarUrl) {
    window.__torisSessionEmail = user?.email || null;
    window.__torisSessionAvatarUrl = avatarUrl || null;
}

async function syncAvatarToParticipantes(user, avatarUrl) {
    if (!user?.email || !avatarUrl) return;
    const { error } = await db.from('participantes')
        .update({ avatar_url: avatarUrl })
        .eq('email', user.email);
    if (error) console.warn('Avatar en participantes:', error.message);
}

function avatarUrlForParticipante(p) {
    if (!p) return null;
    if (p.avatar_url) return p.avatar_url;
    const email = p.email;
    const sessionEmail = window.__torisSessionEmail;
    const sessionAvatar = window.__torisSessionAvatarUrl;
    if (email && sessionEmail && sessionAvatar
        && String(email).toLowerCase() === String(sessionEmail).toLowerCase()) {
        return sessionAvatar;
    }
    return null;
}

function htmlAvatarParticipante(p) {
    const url = avatarUrlForParticipante(p);
    const initial = (p.nombre || '?').charAt(0).toUpperCase();
    if (url) {
        return `<div class="avatar avatar-photo"><img src="${escapeHtml(url)}" alt="" width="36" height="36" referrerpolicy="no-referrer" decoding="async"></div>`;
    }
    return `<div class="avatar">${escapeHtml(initial)}</div>`;
}

function closeTopbarUserMenu() {
    const menu = document.getElementById('topbar-user-menu');
    const dropdown = document.getElementById('topbar-user-dropdown');
    const trigger = document.getElementById('topbar-user-trigger');
    dropdown?.classList.add('hidden');
    trigger?.setAttribute('aria-expanded', 'false');
}

function toggleTopbarUserMenu() {
    const dropdown = document.getElementById('topbar-user-dropdown');
    const trigger = document.getElementById('topbar-user-trigger');
    if (!dropdown || !trigger) return;
    dropdown.classList.toggle('hidden');
    const isOpen = !dropdown.classList.contains('hidden');
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function onTopbarThemeFromMenu() {
    closeTopbarUserMenu();
    toggleTheme();
    updateTopbarMenuThemeLabel();
}

function updateTopbarMenuThemeLabel() {
    const btn = document.getElementById('topbar-menu-theme');
    if (!btn) return;
    const dark = typeof getTheme === 'function' && getTheme() === 'dark';
    btn.innerHTML = `<i data-icon="${dark ? 'sun' : 'moon'}" data-size="18"></i> ${dark ? 'Modo claro' : 'Modo oscuro'}`;
    if (typeof initIconsIn === 'function') initIconsIn(btn);
}

function ensureTopbarMenuDocListener() {
    if (_topbarMenuDocListener) return;
    _topbarMenuDocListener = true;
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('topbar-user-menu');
        if (!menu || menu.contains(e.target)) return;
        closeTopbarUserMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeTopbarUserMenu();
    });
}

async function pintarTopbarUser(user, perfil) {
    const mount = document.getElementById('topbar-user-menu');
    if (!mount || !user) return;
    const nombre = getFullDisplayNameForTopbar(user, perfil);
    const avatar = await resolveAvatarUrl(user, perfil);
    cacheSessionAvatar(user, avatar);
    await syncAvatarToParticipantes(user, avatar);
    const initial = (nombre.charAt(0) || '?').toUpperCase();
    const triggerFace = avatar
        ? `<img class="topbar-user-avatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" decoding="async">`
        : `<span class="topbar-user-avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
    const dark = typeof getTheme === 'function' && getTheme() === 'dark';
    mount.innerHTML = `
        <button type="button" class="topbar-account-trigger" id="topbar-user-trigger"
            onclick="toggleTopbarUserMenu()" aria-haspopup="menu" aria-expanded="false"
            aria-label="Menú de cuenta, ${escapeHtml(nombre)}">
            <span class="topbar-account-avatar-wrap">${triggerFace}</span>
            <span class="topbar-account-name">${escapeHtml(nombre)}</span>
            <span class="topbar-account-chevron" aria-hidden="true"><i data-icon="caret-down" data-size="14"></i></span>
        </button>
        <div class="topbar-user-dropdown hidden" id="topbar-user-dropdown" role="menu">
            <button type="button" class="topbar-user-dropdown-item" id="topbar-menu-theme" role="menuitem"
                onclick="onTopbarThemeFromMenu()">
                <i data-icon="${dark ? 'sun' : 'moon'}" data-size="18"></i> ${dark ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button type="button" class="topbar-user-dropdown-item" role="menuitem"
                onclick="closeTopbarUserMenu(); cerrarSesion()">
                <i data-icon="sign-out" data-size="18"></i> Cerrar sesión
            </button>
        </div>`;
    ensureTopbarMenuDocListener();
    if (typeof initIconsIn === 'function') initIconsIn(mount);
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
    if (pending.avatar_url !== undefined) row.avatar_url = pending.avatar_url;
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
            .select('id, display_name, avatar_url, tema, accesos, updated_at')
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
