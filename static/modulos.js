// Menú desplegable y secciones: marketplaces, cuentas, autenticaciones e historial.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CONTENEDOR = {
    marketplaces: 'mk-list', cuentas: 'cuentas-list',
    autenticaciones: 'auth-list', historial: 'hist-list',
  };

  const state = { mks: [], cuentas: [], auths: [] };
  const loaded = {};

  // ───────────── Utilidades ─────────────
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fecha = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const BRAND = {
    shopify: '#96bf48', walmart: '#0071ce', vtex: '#f71963', amazon: '#ff9900',
    'mercado libre': '#ffdb15', mercadolibre: '#ffdb15', ebay: '#e53238', etsy: '#f1641e',
  };
  
  function isLight(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
  }
  
  function brand(nombre) {
    const k = String(nombre || '').toLowerCase().trim();
    let bg = BRAND[k];
    if (!bg) {
      let h = 0;
      for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
      bg = 'hsl(' + h + ' 55% 55%)';
    }
    return { bg: bg, fg: isLight(bg) ? '#10181b' : '#ffffff' };
  }
  
  const dot = (nombre) =>
    '<span class="mkt-dot" style="background:' + brand(nombre).bg + '"></span>';

  function toast(msg, err) {
    let box = $('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), err ? 6000 : 3200);
  }

  async function api(url, method, body) {
    const opts = { method: method || 'GET' };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    let j;
    try { j = await r.json(); }
    catch (e) { throw new Error('El servidor no respondió correctamente (' + r.status + ')'); }
    if (!j.ok) throw new Error(j.error || 'Algo salió mal');
    return j;
  }

  function tabla(cols, rows, vacio, rowAttrs) {
    if (!rows || !rows.length) return '<p class="empty">' + vacio + '</p>';
    const head = cols.map((c) => '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.t + '</th>').join('');
    const body = rows.map((r) =>
      '<tr' + (rowAttrs ? rowAttrs(r) : '') + '>' +
      cols.map((c) => '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.f(r) + '</td>').join('') +
      '</tr>').join('');
    return '<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  const switchBtn = (id, on, texto) =>
    '<button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') +
    '" aria-label="' + esc(texto) + '" data-toggle="' + id + '"></button>';

  const trashBtn = (id, texto) =>
    '<button type="button" class="btn-icon" data-del="' + id + '" aria-label="' + esc(texto) +
    '" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button>';

  function fillSelect(sel, items, placeholder) {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML =
      '<option value="">' + esc(placeholder) + '</option>' +
      items.map((i) => '<option value="' + esc(i.value) + '">' + esc(i.label) + '</option>').join('');
    if (prev && Array.prototype.some.call(sel.options, (o) => o.value === prev)) sel.value = prev;
  }

  // ───────────── Marketplaces ─────────────
  async function loadMarketplaces() {
    const j = await api('/api/marketplaces/detalle');
    state.mks = j.data;
    const el = $('mk-list');
    if (!el) return;
    el.innerHTML = j.data.length
      ? '<div class="grid">' + j.data.map((m) => {
          const b = brand(m.nombre);
          return '<article class="mk-card">' +
            '<div class="mk-top">' +
              '<span class="mk-tile" style="background:' + b.bg + ';color:' + b.fg + '">' +
                esc(String(m.nombre).charAt(0).toUpperCase()) + '</span>' +
              '<div><h3>' + esc(m.nombre) + '</h3><span class="badge">' + esc(m.auth_tipo || 'ApiKey') + '</span></div>' +
            '</div>' +
            '<div class="mk-stats">' +
              '<div><b>' + (m.endpoints || 0) + '</b><span>endpoints</span></div>' +
              '<div><b>' + (m.cuentas || 0) + '</b><span>cuentas</span></div>' +
            '</div>' +
            '<div class="mk-actions">' +
              '<button type="button" class="btn-sm primary" data-ver="' + esc(m.nombre) + '">Ver endpoints</button>' +
              (m.docs_url
                ? '<a class="btn-sm ghost" href="' + esc(m.docs_url) + '" target="_blank" rel="noopener noreferrer">Docs</a>'
                : '') +
            '</div>' +
          '</article>';
        }).join('') + '</div>'
      : '<p class="empty">Todavía no hay marketplaces. Agrega el primero con el botón de arriba.</p>';
  }

  function verEndpoints(nombre) {
    window.location.href = '/endpoints?marketplace=' + encodeURIComponent(nombre);
  }

  const mkList = $('mk-list');
  if (mkList) {
    mkList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ver]');
      if (b) verEndpoints(b.dataset.ver);
    });
  }

  const btnAddMkt = $('btn-add-mkt');
  if (btnAddMkt) {
    btnAddMkt.addEventListener('click', () => {
      const f = $('form-mkt');
      if (!f) return;
      f.hidden = !f.hidden;
      if (!f.hidden && $('mkt-nombre')) $('mkt-nombre').focus();
    });
  }
  
  const btnCancelMkt = $('btn-cancel-mkt');
  if (btnCancelMkt) {
    btnCancelMkt.addEventListener('click', () => {
      const f = $('form-mkt');
      if (f) f.hidden = true;
    });
  }

  const formMkt = $('form-mkt');
  if (formMkt) {
    formMkt.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('mkt-msg');
      if (msg) msg.textContent = '';
      try {
        await api('/api/marketplaces', 'POST', {
          nombre: $('mkt-nombre').value,
          docs_url: $('mkt-docs') ? $('mkt-docs').value : '',
          auth_tipo: $('mkt-auth') ? $('mkt-auth').value : 'ApiKey',
        });
        e.target.reset();
        e.target.hidden = true;
        toast('Marketplace agregado');
        loaded.cuentas = false; loaded.autenticaciones = false;
        await refresh('marketplaces');
      } catch (err) { if (msg) msg.textContent = err.message; }
    });
  }

  // ───────────── Cuentas ─────────────
  async function loadCuentas() {
    const r = await Promise.all([api('/api/marketplaces/detalle'), api('/api/cuentas')]);
    state.mks = r[0].data;
    state.cuentas = r[1].data;
    const opts = state.mks.map((m) => ({ value: m.id, label: m.nombre }));
    fillSelect($('cuenta-mkt'), opts, 'Elige un marketplace');
    fillSelect($('cuentas-filtro'), opts, 'Todos los marketplaces');
    renderCuentas();
  }

  function renderCuentas() {
    const filtroEl = $('cuentas-filtro');
    const f = filtroEl ? filtroEl.value : '';
    const rows = state.cuentas.filter((c) => !f || String(c.marketplace_id) === f);
    const container = $('cuentas-list');
    if (!container) return;
    container.innerHTML = tabla([
      { t: 'Cuenta', f: (r) => '<span class="cell-main">' + esc(r.nombre) + '</span>' +
          (r.base_url ? '<span class="cell-sub">' + esc(r.base_url) + '</span>' : '') },
      { t: 'Marketplace', f: (r) => '<span class="mkt-inline">' + dot(r.marketplace) + esc(r.marketplace) + '</span>' },
      { t: 'Creada', f: (r) => esc(fecha(r.created_at)) },
      { t: 'Activa', f: (r) => switchBtn(r.id, r.activo, 'Activar o desactivar ' + r.nombre) },
      { t: '<span class="sr-only">Acciones</span>', cls: 'ta-right', f: (r) => trashBtn(r.id, 'Eliminar ' + r.nombre) },
    ], rows, state.cuentas.length
      ? 'Este marketplace todavía no tiene cuentas.'
      : 'Todavía no hay cuentas. Agrega la primera con el formulario de arriba.');
  }

  const cFiltro = $('cuentas-filtro');
  if (cFiltro) cFiltro.addEventListener('change', renderCuentas);

  const formCuenta = $('form-cuenta');
  if (formCuenta) {
    formCuenta.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('form-msg');
      if (msg) msg.textContent = '';
      try {
        await api('/api/cuentas', 'POST', {
          marketplace_id: Number($('cuenta-mkt').value),
          nombre: $('cuenta-nombre').value,
          base_url: $('cuenta-url') ? $('cuenta-url').value : '',
        });
        $('cuenta-nombre').value = '';
        if ($('cuenta-url')) $('cuenta-url').value = '';
        toast('Cuenta guardada');
        loaded.marketplaces = false; loaded.autenticaciones = false;
        await refresh('cuentas');
      } catch (err) { if (msg) msg.textContent = err.message; }
    });
  }

  const cuentasList = $('cuentas-list');
  if (cuentasList) {
    cuentasList.addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-toggle]');
      const del = e.target.closest('[data-del]');
      try {
        if (sw) {
          const on = sw.getAttribute('aria-checked') === 'true';
          await api('/api/cuentas/' + sw.dataset.toggle, 'PATCH', { activo: !on });
          toast(on ? 'Cuenta desactivada' : 'Cuenta activada');
          await refresh('cuentas');
        } else if (del) {
          const c = state.cuentas.find((x) => String(x.id) === del.dataset.del);
          if (!confirm('¿Eliminar la cuenta "' + (c ? c.nombre : '') + '"? Se borrarán también sus credenciales y su historial.')) return;
          await api('/api/cuentas/' + del.dataset.del, 'DELETE');
          toast('Cuenta eliminada');
          loaded.marketplaces = false; loaded.autenticaciones = false; loaded.historial = false;
          await refresh('cuentas');
        }
      } catch (err) { toast(err.message, true); }
    });
  }

  // ───────────── Autenticaciones ─────────────
  function vence(r) {
    if (!r.expira_en) return '<span class="badge muted">Sin vencimiento</span>';
    const d = new Date(r.expira_en);
    if (isNaN(d)) return '—';
    const dias = Math.ceil((d - Date.now()) / 86400000);
    if (dias < 0) return '<span class="badge err">Venció el ' + esc(fecha(r.expira_en)) + '</span>';
    if (dias <= 7) return '<span class="badge warn">Vence en ' + dias + (dias === 1 ? ' día' : ' días') + '</span>';
    return '<span class="badge ok">Vence en ' + dias + ' días</span>';
  }

  async function loadAuths() {
    const r = await Promise.all([api('/api/cuentas'), api('/api/autenticaciones')]);
    state.cuentas = r[0].data;
    state.auths = r[1].data;
    fillSelect($('auth-cuenta'),
      state.cuentas.map((c) => ({ value: c.id, label: c.nombre + ' (' + c.marketplace + ')' })),
      'Elige una cuenta');
    const container = $('auth-list');
    if (!container) return;
    container.innerHTML = tabla([
      { t: 'Cuenta', f: (a) => '<span class="cell-main">' + esc(a.cuenta) + '</span>' },
      { t: 'Marketplace', f: (a) => '<span class="mkt-inline">' + dot(a.marketplace) + esc(a.marketplace) + '</span>' },
      { t: 'Tipo', f: (a) => '<span class="badge">' + esc(a.tipo) + '</span>' },
      { t: 'Vigencia', f: (a) => vence(a) },
      { t: 'Activa', f: (a) => switchBtn(a.id, a.activo, 'Activar o desactivar credencial') },
      { t: '<span class="sr-only">Acciones</span>', cls: 'ta-right', f: (a) => trashBtn(a.id, 'Eliminar credencial') },
    ], state.auths, 'Todavía no hay credenciales guardadas. Agrega la primera con el formulario de arriba.');
  }

  const formAuth = $('form-auth');
  if (formAuth) {
    formAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('auth-msg');
      if (msg) msg.textContent = '';
      const exp = $('auth-expira') ? $('auth-expira').value : '';
      try {
        await api('/api/autenticaciones', 'POST', {
          cuenta_id: Number($('auth-cuenta').value),
          tipo: $('auth-tipo').value,
          credenciales: $('auth-cred').value,
          expira_en: exp ? exp.replace('T', ' ') + ':00' : null,
        });
        $('auth-cred').value = '';
        if ($('auth-expira')) $('auth-expira').value = '';
        toast('Credencial guardada y cifrada');
        await refresh('autenticaciones');
      } catch (err) { if (msg) msg.textContent = err.message; }
    });
  }

  const authList = $('auth-list');
  if (authList) {
    authList.addEventListener('click', async (e) => {
      const sw = e.target.closest('[data-toggle]');
      const del = e.target.closest('[data-del]');
      try {
        if (sw) {
          const on = sw.getAttribute('aria-checked') === 'true';
          await api('/api/autenticaciones/' + sw.dataset.toggle, 'PATCH', { activo: !on });
          toast(on ? 'Credencial desactivada' : 'Credencial activada');
          await refresh('autenticaciones');
        } else if (del) {
          if (!confirm('¿Eliminar esta credencial? No se puede recuperar.')) return;
          await api('/api/autenticaciones/' + del.dataset.del, 'DELETE');
          toast('Credencial eliminada');
          await refresh('autenticaciones');
        }
      } catch (err) { toast(err.message, true); }
    });
  }

  // ───────────── Historial ─────────────
  function estadoHttp(code) {
    if (code == null) return '<span class="badge muted">Sin respuesta</span>';
    const c = Number(code);
    const k = c < 300 ? 'ok' : c < 400 ? '' : c < 500 ? 'warn' : 'err';
    return '<span class="badge ' + k + '">' + c + '</span>';
  }

  const pretty = (v) => {
    if (v == null || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return String(v); }
  };

  async function loadHistorial() {
    const cu = await api('/api/cuentas');
    state.cuentas = cu.data;
    const select = $('hist-cuenta');
    fillSelect(select,
      cu.data.map((c) => ({ value: c.id, label: c.nombre + ' (' + c.marketplace + ')' })),
      'Todas las cuentas');
    const id = select ? select.value : '';
    const j = await api('/api/historial?limit=50' + (id ? '&cuenta_id=' + encodeURIComponent(id) : ''));
    const rows = j.data;
    const resumen = $('hist-summary');
    if (resumen) {
      if (rows.length) {
        const ok = rows.filter((r) => r.status_code != null && r.status_code < 400).length;
        resumen.textContent = 'Últimas ' + rows.length + ' ejecuciones, ' + Math.round((ok / rows.length) * 100) + ' % exitosas';
      } else {
        resumen.textContent = '';
      }
    }
    const container = $('hist-list');
    if (!container) return;
    container.innerHTML = tabla([
      { t: 'Fecha', f: (r) => esc(fecha(r.ejecutado_en)) },
      { t: 'Cuenta', f: (r) => '<span class="cell-main">' + esc(r.cuenta) + '</span><span class="cell-sub">' + esc(r.marketplace) + '</span>' },
      { t: 'Endpoint', f: (r) => '<span class="badge-method m-' + esc(r.method) + '">' + esc(r.method) + '</span> <code>' + esc(r.endpoint) + '</code>' },
      { t: 'Estado', f: (r) => estadoHttp(r.status_code) },
      { t: 'Duración', f: (r) => (r.duracion_ms != null ? r.duracion_ms + ' ms' : '—') },
    ], rows, 'Todavía no hay ejecuciones registradas. Cuando pruebes un endpoint con una cuenta, aparecerá aquí.',
    (r) => ' class="clickable" tabindex="0" data-hid="' + r.id + '"');
  }

  async function toggleDetalle(tr) {
    const sig = tr.nextElementSibling;
    if (sig && sig.classList.contains('detail')) { sig.remove(); tr.classList.remove('open'); return; }
    const det = document.createElement('tr');
    det.className = 'detail';
    det.innerHTML = '<td colspan="5">Cargando…</td>';
    tr.after(det);
    tr.classList.add('open');
    try {
      const j = await api('/api/historial/' + tr.dataset.hid);
      const d = j.data;
      det.firstChild.innerHTML =
        '<div class="detail-grid">' +
          '<div><h4>Cuerpo enviado</h4><pre>' + esc(pretty(d.request_body)) + '</pre></div>' +
          '<div><h4>Encabezados</h4><pre>' + esc(pretty(d.headers)) + '</pre></div>' +
          '<div><h4>Respuesta</h4><pre>' + esc(pretty(d.respuesta)) + '</pre></div>' +
        '</div>';
    } catch (err) { det.firstChild.textContent = 'No se pudo cargar el detalle: ' + err.message; }
  }

  const histList = $('hist-list');
  if (histList) {
    histList.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-hid]');
      if (tr) toggleDetalle(tr);
    });
    histList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr[data-hid]');
      if (tr) { e.preventDefault(); toggleDetalle(tr); }
    });
  }

  const histCuenta = $('hist-cuenta');
  if (histCuenta) histCuenta.addEventListener('change', () => refresh('historial').catch((err) => toast(err.message, true)));

  const histRefresh = $('hist-refresh');
  if (histRefresh) {
    histRefresh.addEventListener('click', () =>
      refresh('historial').then(() => toast('Historial actualizado')).catch((err) => toast(err.message, true)));
  }

  // ───────────── Navegación ─────────────
  const loaders = {
    marketplaces: loadMarketplaces, cuentas: loadCuentas,
    autenticaciones: loadAuths, historial: loadHistorial,
  };

  async function refresh(name) {
    if (loaders[name]) {
      await loaders[name]();
      loaded[name] = true;
    }
  }

  function showError(name, e) {
    const box = $(CONTENEDOR[name]);
    if (!box) return;
    let m = 'No se pudo cargar: ' + e.message + '.';
    if (/exist|table|tabla/i.test(e.message)) m += ' Revisa que ya ejecutaste schema.sql en tu base de datos.';
    box.innerHTML = '<p class="empty">' + esc(m) + '</p>';
  }

  // Cada página es independiente: carga solo su propio módulo.
  const pagina = document.body.dataset.page;
  if (loaders[pagina]) {
    refresh(pagina).catch((e) => showError(pagina, e));
  }
})();