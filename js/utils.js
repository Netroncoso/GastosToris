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

// Convierte un string "YYYY-MM-DD" (como lo guarda un <input type="date">) a un Date
// en hora LOCAL, evitando el corrimiento de día que da `new Date("YYYY-MM-DD")`
// (que lo interpreta como UTC medianoche y en Argentina muestra el día anterior).
function parseFechaLocal(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
