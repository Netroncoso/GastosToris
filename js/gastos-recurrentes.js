// =============================================
// Gastos recurrentes — helpers (plantillas + ocurrencias)
// =============================================

/** Suma meses a una fecha ISO (YYYY-MM-DD), opcionalmente fijando el día del mes (1–28). */
function addMonthsISO(dateStr, months, preferredDay) {
    const base = String(dateStr || hoyISO()).slice(0, 10);
    const [y, m, d] = base.split('-').map(Number);
    const day = preferredDay != null && preferredDay >= 1 && preferredDay <= 28
        ? preferredDay
        : (d || 1);
    const totalMonths = (y * 12 + (m - 1)) + Number(months || 0);
    const ny = Math.floor(totalMonths / 12);
    const nm = (totalMonths % 12) + 1;
    const dim = new Date(ny, nm, 0).getDate();
    const nd = Math.min(day, dim);
    return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

function fechaPrevistaOcurrencia(plantilla, nro) {
    const inicio = String(plantilla.fecha_inicio || hoyISO()).slice(0, 10);
    const n = Math.max(1, Number(nro) || 1);
    if (n === 1) return inicio;
    const intervalo = Math.max(1, Number(plantilla.intervalo_meses) || 1);
    return addMonthsISO(inicio, (n - 1) * intervalo, plantilla.dia_mes);
}

/**
 * Filas a insertar en gastos_recurrentes_ocurrencias al crear la plantilla.
 * @returns {Array<{nro:number, fecha_prevista:string, estado:string}>}
 */
function buildOcurrenciasIniciales(plantilla) {
    if (plantilla.modo === 'cuotas') {
        const total = Math.max(1, Number(plantilla.cuotas_total) || 1);
        return Array.from({ length: total }, (_, i) => ({
            nro: i + 1,
            fecha_prevista: fechaPrevistaOcurrencia(plantilla, i + 1),
            estado: 'pendiente'
        }));
    }
    return [{
        nro: 1,
        fecha_prevista: fechaPrevistaOcurrencia(plantilla, 1),
        estado: 'pendiente'
    }];
}

function siguienteOcurrenciaAbierta(plantilla, ultimoNro) {
    const nro = Math.max(1, Number(ultimoNro) || 1) + 1;
    return {
        nro,
        fecha_prevista: fechaPrevistaOcurrencia(plantilla, nro),
        estado: 'pendiente'
    };
}

function splitIgualDefault(participantes, monto) {
    const list = Array.isArray(participantes) ? participantes : [];
    const n = list.length;
    const total = Number(monto) || 0;
    if (!n || !(total > 0)) return [];
    const base = Math.floor((total / n) * 100) / 100;
    const resto = Math.round((total - base * n) * 100) / 100;
    return list.map((p, i) => ({
        id_participante: p.id,
        monto: i === 0 ? base + resto : base
    }));
}

function conceptoDesdeRecurrente(plantilla, ocurrencia) {
    const nombre = (plantilla.nombre || 'Recurrente').trim();
    if (plantilla.modo === 'cuotas' && plantilla.cuotas_total) {
        return `${nombre} (${ocurrencia.nro}/${plantilla.cuotas_total})`;
    }
    return nombre;
}

function labelPendienteRecurrente(plantilla, ocurrencia) {
    const nombre = plantilla.nombre || 'Recurrente';
    let meta = '';
    if (plantilla.modo === 'cuotas' && plantilla.cuotas_total) {
        meta = `${ocurrencia.nro}/${plantilla.cuotas_total}`;
    } else {
        meta = 'Recurrente';
    }
    if (ocurrencia.fecha_prevista) {
        const d = new Date(ocurrencia.fecha_prevista + 'T12:00:00');
        const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
        meta += ` · ${fecha}`;
    }
    return { titulo: nombre, meta, monto: Number(plantilla.monto) || 0 };
}

function fmtFechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Etiqueta legible del reparto guardado en split_default. */
function labelReparto(splitDefault, monto, pagadorId, participantes) {
    const splits = Array.isArray(splitDefault)
        ? splitDefault.map(s => ({ id_participante: Number(s.id_participante), monto: Number(s.monto) }))
            .filter(s => s.id_participante && s.monto > 0)
        : [];
    const total = Number(monto) || 0;
    const n = Array.isArray(participantes) ? participantes.length : 0;
    if (!total || !splits.length) return 'Partes iguales';
    if (splits.length === 1) return 'Solo quien paga';
    if (n > 1 && splits.length === n) {
        const iguales = splitIgualDefault(participantes, total);
        const match = iguales.length === splits.length && iguales.every(exp =>
            splits.some(s => s.id_participante === exp.id_participante && Math.abs(s.monto - exp.monto) < 0.02)
        );
        if (match) return 'Partes iguales';
    }
    const pid = pagadorId != null ? Number(pagadorId) : null;
    if (pid && splits.length === 1 && Math.abs(splits[0].monto - total) < 0.02 && splits[0].id_participante === pid) {
        return 'Solo quien paga';
    }
    return 'Personalizado';
}

/**
 * Tras editar plantilla: recalcular fechas pendientes y ajustar cuotas faltantes/sobrantes.
 * No modifica ocurrencias ya aplicadas.
 */
async function syncOcurrenciasTrasEditar(plantilla, updatedPlantilla) {
    if (!plantilla?.id) return;
    const occs = plantilla.ocurrencias || [];
    const pendientes = occs.filter(o => o.estado === 'pendiente');

    for (const o of pendientes) {
        const nuevaFecha = fechaPrevistaOcurrencia(updatedPlantilla, o.nro);
        if (o.fecha_prevista !== nuevaFecha) {
            await db.from('gastos_recurrentes_ocurrencias')
                .update({ fecha_prevista: nuevaFecha })
                .eq('id', o.id);
        }
    }

    if (updatedPlantilla.modo !== 'cuotas') return;

    const newTotal = Math.max(1, Number(updatedPlantilla.cuotas_total) || 1);
    const byNro = new Map(occs.map(o => [Number(o.nro), o]));

    for (let n = 1; n <= newTotal; n++) {
        if (!byNro.has(n)) {
            await db.from('gastos_recurrentes_ocurrencias').insert({
                id_recurrente: plantilla.id,
                nro: n,
                fecha_prevista: fechaPrevistaOcurrencia(updatedPlantilla, n),
                estado: 'pendiente'
            });
        }
    }

    const extras = pendientes.filter(o => o.nro > newTotal);
    if (extras.length) {
        await db.from('gastos_recurrentes_ocurrencias')
            .delete()
            .in('id', extras.map(o => o.id));
    }
}
