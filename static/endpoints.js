// Página de Endpoints: búsqueda con filtros sobre /api/endpoints.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url) {
    const r = await fetch(url);
    let j;
    try { j = await r.json(); }
    catch (e) { throw new Error('El servidor no respondió correctamente (' + r.status + ')'); }
    if (!j.ok) throw new Error(j.error || 'Algo salió mal');
    return j;
  }

  async function cargarMarketplaces() {
    const j = await api('/api/marketplaces');
    const sel = $('ep-mkt');
    sel.innerHTML = '<option value="">Todos</option>' +
      j.data.map((m) => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('');
    const pre = new URLSearchParams(location.search).get('marketplace');
    if (pre) sel.value = pre;
  }

  async function buscar() {
    const box = $('ep-list');
    const p = new URLSearchParams();
    if ($('ep-q').value.trim()) p.set('q', $('ep-q').value.trim());
    if ($('ep-mkt').value) p.set('marketplace', $('ep-mkt').value);
    if ($('ep-method').value) p.set('method', $('ep-method').value);
    try {
      const j = await api('/api/endpoints?' + p.toString());
      $('ep-summary').textContent = j.total + (j.total === 1 ? ' resultado' : ' resultados') +
        (j.total === 200 ? ' (mostrando los primeros 200)' : '');
      if (!j.data.length) { box.innerHTML = '<p class="empty">No se encontraron endpoints con esos filtros.</p>'; return; }
      box.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
        '<th>Método</th><th>Endpoint</th><th>Marketplace</th><th>Descripción</th></tr></thead><tbody>' +
        j.data.map((r) =>
          '<tr><td><span class="badge-method m-' + esc(r.method) + '">' + esc(r.method) + '</span></td>' +
          '<td><code>' + esc(r.endpoint) + '</code></td>' +
          '<td>' + esc(r.marketplace) + '</td>' +
          '<td>' + esc(r.description || '—') +
            (r.source_url ? ' <a href="' + esc(r.source_url) + '" target="_blank" rel="noopener noreferrer">docs</a>' : '') +
          '</td></tr>').join('') +
        '</tbody></table></div>';
    } catch (e) {
      box.innerHTML = '<p class="empty">No se pudo cargar: ' + esc(e.message) + '</p>';
    }
  }

  window.buscar = buscar;
  $('form-buscar').addEventListener('submit', (e) => { e.preventDefault(); buscar(); });
  $('ep-mkt').addEventListener('change', buscar);
  $('ep-method').addEventListener('change', buscar);

  cargarMarketplaces().catch(() => {}).then(buscar);
})();
