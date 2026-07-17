// =============================================
// AUTH COMPARTIDA (para gastos.html, listas.html, tareas.html)
// index.html maneja su propio login, estas páginas solo verifican
// que haya sesión y si no, redirigen para adentro.
// =============================================

async function requireAuth(onReady) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    pintarTopbarUser(session.user);
    onReady(session.user);
}

db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = 'index.html';
    }
});

function pintarTopbarUser(user) {
    const el = document.getElementById('topbar-user');
    if (!el) return;
    const nombre = (user.user_metadata?.full_name || user.email || '').split(' ')[0];
    el.textContent = nombre;
}

async function cerrarSesion() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

function irAlInicio() {
    window.location.href = 'index.html';
}
