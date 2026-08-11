// =============================================
// Formulario de gasto compartido (gastos + listas)
// =============================================

const CATEGORIAS_DEFECTO = [
    { nombre: 'Super', icono: 'shopping-cart' },
    { nombre: 'Carnicería', icono: 'cow' },
    { nombre: 'Verdulería', icono: 'carrot' },
    { nombre: 'Gatos', icono: 'cat' },
    { nombre: 'Casa alquiler', icono: 'house' },
    { nombre: 'Casa impuestos', icono: 'receipt' },
    { nombre: 'Tarjetas', icono: 'credit-card' },
    { nombre: 'Auto', icono: 'car' },
    { nombre: 'Viajes', icono: 'paper-plane-tilt' },
    { nombre: 'Salidas', icono: 'beer-stein' },
    { nombre: 'Otros', icono: 'package' }
];

/** Defaults de la app + custom del círculo (sin duplicar por nombre). */
function resolverCategorias(rawCategorias) {
    const byName = new Map();
    CATEGORIAS_DEFECTO.forEach(c => {
        byName.set(String(c.nombre).toLowerCase(), { nombre: c.nombre, icono: c.icono || 'package' });
    });
    if (Array.isArray(rawCategorias)) {
        rawCategorias.forEach(c => {
            const item = typeof c === 'string'
                ? { nombre: c }
                : { nombre: c?.nombre || c?.name, icono: c?.icono || c?.icon };
            if (!item.nombre) return;
            const key = String(item.nombre).toLowerCase();
            if (!byName.has(key)) {
                byName.set(key, { nombre: item.nombre, icono: migrarIconoLegacy(item.icono || 'package') });
            } else if (item.icono) {
                const prev = byName.get(key);
                byName.set(key, { nombre: prev.nombre, icono: migrarIconoLegacy(item.icono) });
            }
        });
    }
    return [...byName.values()];
}

/**
 * Monta el cuerpo del formulario de gasto dentro de rootEl.
 * @param {HTMLElement} rootEl
 * @param {{
 *   idPrefix?: string,
 *   showPeriodo?: boolean,
 *   showGestionarCategorias?: boolean,
 *   onGestionarCategorias?: () => void,
 *   autoRepartirOnMonto?: boolean
 * }} options
 */
function montarGastoForm(rootEl, options = {}) {
    if (!rootEl) throw new Error('montarGastoForm: rootEl requerido');
    const p = options.idPrefix || 'gf';
    const showPeriodo = !!options.showPeriodo;
    const showGestionar = !!options.showGestionarCategorias;
    let autoRepartirOnMonto = options.autoRepartirOnMonto !== false;

    let participantes = [];
    let categorias = CATEGORIAS_DEFECTO.map(c => ({ ...c }));
    let skipAutoRepartir = false;

    rootEl.innerHTML = `
        ${showPeriodo ? `
        <div class="form-group">
            <label for="${p}-periodo">Periodo</label>
            <select id="${p}-periodo" name="periodo"></select>
        </div>` : ''}
        <div class="form-group">
            <label for="${p}-concepto">Concepto</label>
            <input type="text" id="${p}-concepto" name="concepto" placeholder="Ej: Compra del sábado…" autocomplete="off" />
        </div>
        <div class="form-group">
            <label for="${p}-fecha">Fecha del gasto</label>
            <input type="date" id="${p}-fecha" name="fecha_gasto" />
        </div>
        <div class="form-group">
            <label for="${p}-monto">Monto total ($)</label>
            <input type="text" id="${p}-monto" name="monto" class="input-monto" placeholder="0" inputmode="decimal" autocomplete="off" />
        </div>
        <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <label for="${p}-tipo" style="margin-bottom:0">Categoría</label>
                ${showGestionar ? `<button type="button" class="btn btn-ghost btn-sm" id="${p}-btn-cats" style="padding:2px 8px;font-size:12px">Gestionar</button>` : ''}
            </div>
            <select id="${p}-tipo" name="tipo"></select>
        </div>
        <div class="form-group">
            <label for="${p}-pagador">¿Quién pagó?</label>
            <select id="${p}-pagador" name="pagador"></select>
        </div>
        <div class="form-group">
            <label>División por persona ($)</label>
            <div style="display:flex;gap:8px;margin-bottom:10px">
                <button type="button" class="btn btn-ghost btn-sm" id="${p}-btn-igual">Partes iguales</button>
                <button type="button" class="btn btn-ghost btn-sm" id="${p}-btn-limpiar">Limpiar</button>
            </div>
            <div id="${p}-split-container"></div>
            <div id="${p}-split-total-row" class="split-total-row"></div>
        </div>
    `;

    const el = (suffix) => document.getElementById(`${p}-${suffix}`);

    if (showGestionar) {
        el('btn-cats').onclick = () => options.onGestionarCategorias?.();
    }
    el('btn-igual').onclick = () => repartirIgual();
    el('btn-limpiar').onclick = () => limpiarSplit();

    bindMontoInput(el('monto'), () => onMontoInput());

    function renderCategorias(valorActual = null) {
        const sel = el('tipo');
        sel.innerHTML = categorias.map(c =>
            `<option value="${String(c.nombre).replace(/"/g, '&quot;')}">${escapeHtml(c.nombre)}</option>`
        ).join('');
        if (valorActual && categorias.some(c => c.nombre === valorActual)) {
            sel.value = valorActual;
        } else if (categorias[0]) {
            sel.value = categorias[0].nombre;
        }
    }

    function renderPagador(selectedId = null) {
        const sel = el('pagador');
        sel.innerHTML = participantes.map(part =>
            `<option value="${part.id}">${escapeHtml(part.nombre)}</option>`
        ).join('');
        if (selectedId != null && participantes.some(part => Number(part.id) === Number(selectedId))) {
            sel.value = String(selectedId);
        } else if (participantes[0]) {
            sel.value = String(participantes[0].id);
        }
    }

    function renderSplit() {
        const cont = el('split-container');
        cont.innerHTML = participantes.map(part => `
            <div class="split-row">
                <div class="split-name">${escapeHtml(part.nombre)}</div>
                <input type="text" class="split-input input-monto" id="${p}-split-${part.id}"
                    placeholder="0" inputmode="decimal" autocomplete="off" />
            </div>
        `).join('');
        participantes.forEach(part => {
            const input = document.getElementById(`${p}-split-${part.id}`);
            if (input) {
                delete input.dataset.montoBound;
                bindMontoInput(input, () => onSplitInput(part.id));
            }
        });
        syncSplitEnabled();
    }

    function syncSplitEnabled() {
        const monto = parseMonto(el('monto').value) || 0;
        const enabled = monto > 0;
        participantes.forEach(part => {
            const input = document.getElementById(`${p}-split-${part.id}`);
            if (!input) return;
            input.disabled = !enabled;
            if (!enabled) {
                input.value = '';
                delete input.dataset.autoResto;
            }
        });
        if (!enabled) el('split-total-row').innerHTML = '';
    }

    function onMontoInput() {
        syncSplitEnabled();
        if (autoRepartirOnMonto && !skipAutoRepartir) repartirIgual();
        else actualizarTotal();
    }

    function repartirIgual() {
        const monto = parseMonto(el('monto').value) || 0;
        const n = participantes.length;
        if (!monto || !n) return;
        syncSplitEnabled();
        const base = Math.floor((monto / n) * 100) / 100;
        const resto = Math.round((monto - base * n) * 100) / 100;
        participantes.forEach((part, i) => {
            const input = document.getElementById(`${p}-split-${part.id}`);
            if (!input) return;
            setMontoInput(input, i === 0 ? (base + resto) : base);
            delete input.dataset.autoResto;
        });
        actualizarTotal();
    }

    function limpiarSplit() {
        participantes.forEach(part => {
            const input = document.getElementById(`${p}-split-${part.id}`);
            if (!input) return;
            input.value = '';
            delete input.dataset.autoResto;
        });
        el('split-total-row').innerHTML = '';
    }

    function onSplitInput(changedId) {
        const monto = parseMonto(el('monto').value) || 0;
        if (!(monto > 0)) {
            syncSplitEnabled();
            return;
        }
        aplicarRestoSplit({
            total: monto,
            participantes,
            changedId,
            getInput: id => document.getElementById(`${p}-split-${id}`)
        });
        actualizarTotal();
    }

    function actualizarTotal() {
        const monto = parseMonto(el('monto').value) || 0;
        let total = 0;
        participantes.forEach(part => {
            total += parseMonto(document.getElementById(`${p}-split-${part.id}`)?.value) || 0;
        });
        total = Math.round(total * 100) / 100;
        const row = el('split-total-row');
        if (!monto) { row.innerHTML = ''; return; }
        const diff = Math.round((total - monto) * 100) / 100;
        const ok = Math.abs(diff) < 0.02;
        row.innerHTML = ok
            ? `<span class="text-positive" style="font-weight:600"><i data-icon="check" data-size="14"></i> Total: $${fmt(total)}</span>`
            : `<span class="text-negative">Total: $${fmt(total)} · ${diff > 0 ? '+' : ''}$${fmt(diff)}</span>`;
    }

    function setParticipantes(list) {
        participantes = Array.isArray(list) ? list : [];
        renderPagador();
        renderSplit();
    }

    function setPeriodos(list, selectedId = null) {
        if (!showPeriodo) return;
        const sel = el('periodo');
        const periodos = Array.isArray(list) ? list : [];
        sel.innerHTML = periodos.map(per =>
            `<option value="${per.id}">${escapeHtml(per.nombre)}</option>`
        ).join('');
        if (selectedId != null) sel.value = String(selectedId);
    }

    function setCategoriasFromCirculo(raw, valorActual = null) {
        categorias = resolverCategorias(raw);
        renderCategorias(valorActual);
    }

    function setCategorias(list, valorActual = null) {
        categorias = Array.isArray(list) && list.length
            ? list.map(c => ({ nombre: c.nombre, icono: migrarIconoLegacy(c.icono || 'package') }))
            : CATEGORIAS_DEFECTO.map(c => ({ ...c }));
        renderCategorias(valorActual);
    }

    /**
     * Prefill del formulario.
     * @param {{
     *   concepto?: string,
     *   fecha?: string,
     *   monto?: number|null,
     *   tipo?: string|null,
     *   pagadorId?: number|string|null,
     *   periodoId?: number|string|null,
     *   splits?: Array<{id_participante:number, monto:number}>,
     *   autoRepartir?: boolean,
     *   preferTipoFromConcepto?: boolean
     * }} defaults
     */
    function reset(defaults = {}) {
        skipAutoRepartir = true;
        el('concepto').value = defaults.concepto || '';
        el('fecha').value = defaults.fecha || hoyISO();
        setMontoInput(el('monto'), defaults.monto != null && Number.isFinite(Number(defaults.monto))
            ? Number(defaults.monto)
            : NaN);

        let tipo = defaults.tipo || null;
        if (!tipo && defaults.preferTipoFromConcepto) {
            const nombreLista = (defaults.concepto || '').trim().toLowerCase();
            tipo = categorias.find(c => c.nombre.toLowerCase() === nombreLista)?.nombre
                || categorias.find(c => /super|verdul|carnic/i.test(c.nombre))?.nombre
                || categorias[0]?.nombre;
        }
        renderCategorias(tipo);
        renderPagador(defaults.pagadorId);
        if (showPeriodo && defaults.periodoId != null) {
            el('periodo').value = String(defaults.periodoId);
        }
        renderSplit();

        if (Array.isArray(defaults.splits) && defaults.splits.length) {
            defaults.splits.forEach(s => {
                const input = document.getElementById(`${p}-split-${s.id_participante}`);
                if (input) setMontoInput(input, Number(s.monto));
            });
            actualizarTotal();
        } else if (defaults.autoRepartir !== false && (parseMonto(el('monto').value) || 0) > 0) {
            repartirIgual();
        } else {
            actualizarTotal();
        }
        skipAutoRepartir = false;
    }

    function getValues() {
        const monto = parseMonto(el('monto').value);
        const splits = [];
        let totalSplit = 0;
        participantes.forEach(part => {
            const val = parseMonto(document.getElementById(`${p}-split-${part.id}`)?.value) || 0;
            if (val > 0) {
                splits.push({ id_participante: part.id, monto: val });
                totalSplit += val;
            }
        });
        const out = {
            concepto: el('concepto').value.trim(),
            fecha: el('fecha').value || hoyISO(),
            monto,
            tipo: el('tipo').value,
            pagador: el('pagador').value ? Number(el('pagador').value) : null,
            splits,
            totalSplit: Math.round(totalSplit * 100) / 100
        };
        if (showPeriodo) {
            out.periodoId = el('periodo').value ? Number(el('periodo').value) : null;
        }
        return out;
    }

    function focusConcepto() {
        setTimeout(() => el('concepto')?.focus(), 100);
    }

    // initial empty state
    renderCategorias();
    renderPagador();
    renderSplit();

    return {
        setParticipantes,
        setPeriodos,
        setCategorias,
        setCategoriasFromCirculo,
        reset,
        getValues,
        focusConcepto,
        repartirIgual,
        limpiarSplit,
        refreshTipoSelect: renderCategorias,
        setAutoRepartir: (v) => { autoRepartirOnMonto = !!v; },
        prefix: p,
        getCategorias: () => categorias.slice()
    };
}
