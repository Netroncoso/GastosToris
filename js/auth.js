// =============================================
// AUTH COMPARTIDA (para gastos.html, listas.html, tareas.html)
// index.html maneja su propio login, estas páginas solo verifican
// que haya sesión y si no, redirigen para adentro.
// =============================================

async function requireAuth(onReady) {
    let session = (await db.auth.getSession()).data.session;
    if (!session) {
        session = await new Promise(resolve => {
            let sub = null;
            const timeout = setTimeout(() => {
                if (sub) sub.unsubscribe();
                resolve(null);
            }, 3000);
            const { data: { subscription } } = db.auth.onAuthStateChange((event, s) => {
                if (s || event === 'INITIAL_SESSION') {
                    clearTimeout(timeout);
                    subscription.unsubscribe();
                    resolve(s || null);
                }
            });
            sub = subscription;
        });
    }
    if (!session) {
        window.location.href = './index.html';
        return;
    }
    pintarTopbarUser(session.user);
    onReady(session.user);
}

db.auth.onAuthStateChange(async (event, session) => {
    if (session && typeof guardarTokenGoogleIfPresent === 'function') {
        await guardarTokenGoogleIfPresent(session);
    }
    if (event === 'SIGNED_OUT') {
        window.location.href = './index.html';
    }
});

function pintarTopbarUser(user) {
    const el = document.getElementById('topbar-user');
    if (!el) return;
    const nombre = (user.user_metadata?.full_name || user.email || '').split(' ')[0];
    el.textContent = nombre;
}

async function cerrarSesion() {
    try { localStorage.removeItem('toris-last-route'); } catch (_) {}
    await db.auth.signOut();
    window.location.href = './index.html';
}

function irAlInicio() {
    try { localStorage.removeItem('toris-last-route'); } catch (_) {}
    window.location.href = './index.html';
}
