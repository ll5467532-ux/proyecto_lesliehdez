/* Lógica de interacción de historial.html */

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const list = $('hist-list');
  const count = $('hist-count');
  const accountFilter = $('hist-cuenta');
  const methodFilter = $('hist-method');
  const search = $('hist-search');
  const modal = $('detail-modal');
  let logs = [];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  async function getJSON(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data;
  }

  async function cargarCuentas() {
    try {
      const json = await getJSON('/api/cuentas');
      accountFilter.innerHTML = '<option value="">Todas las cuentas</option>' +
        (json.data || []).map(c => `<option value="${Number(c.id)}">${esc(c.nombre)} (${esc(c.marketplace)})</option>`).join('');
    } catch (e) {
      console.error('No se pudieron cargar las cuentas', e);
    }
  }

  async function cargarHistorial() {
    list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">Cargando historial real…</td></tr>';
    try {
      const query = new URLSearchParams({limit: '200'});
      if (accountFilter.value) query.set('cuenta_id', accountFilter.value);
      const json = await getJSON('/api/historial?' + query);
      logs = json.data || [];
      render();
    } catch (e) {
      logs = [];
      list.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#b91c1c">${esc(e.message)}</td></tr>`;
      count.textContent = 'Error';
    }
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const method = methodFilter.value;
    const filtered = logs.filter(item =>
      (!q || `${item.endpoint || ''} ${item.cuenta || ''} ${item.marketplace || ''}`.toLowerCase().includes(q)) &&
      (!method || item.method === method)
    );
    count.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
    if (!filtered.length) {
      list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b">No hay ejecuciones registradas con esos filtros.</td></tr>';
      return;
    }
    list.innerHTML = filtered.map(item => {
      const status = item.status == null ? 'Error de conexión' : `HTTP ${item.status}`;
      const statusClass = item.status >= 200 && item.status < 300 ? 'status-200' : 'status-400';
      return `<tr>
        <td><span style="font-size:.875rem;color:#64748b">${esc(item.fecha || '—')}</span></td>
        <td><strong>${esc(item.cuenta || '—')}</strong><br><small>${esc(item.marketplace || '')}</small></td>
        <td><span class="method-badge method-${esc(String(item.method || 'GET').toLowerCase())}">${esc(item.method || '—')}</span></td>
        <td><code>${esc(item.endpoint || '—')}</code></td>
        <td><span class="status-badge ${statusClass}">${esc(status)}</span><br><small>${Number(item.duracion_ms || 0)} ms</small></td>
        <td style="text-align:right"><button class="btn btn-secondary btn-sm js-detail" data-id="${Number(item.id)}">🔍 Detalle</button></td>
      </tr>`;
    }).join('');
  }

  list.addEventListener('click', async ev => {
    const button = ev.target.closest('.js-detail');
    if (!button) return;
    button.disabled = true;
    try {
      const json = await getJSON(`/api/historial/${Number(button.dataset.id)}`);
      const item = json.data;
      $('modal-title').textContent = `Detalle de ejecución #${item.id}`;
      $('modal-sub').textContent = 'Solicitud y respuesta guardadas en la base de datos. Los valores sensibles se muestran enmascarados.';
      $('modal-json').textContent = JSON.stringify({
        solicitud: item.request_body,
        headers: item.headers,
        respuesta: parseResponse(item.respuesta)
      }, null, 2);
      modal.classList.add('active');
    } catch (e) {
      alert('No se pudo cargar el detalle: ' + e.message);
    } finally {
      button.disabled = false;
    }
  });

  function parseResponse(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  $('modal-close').addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.classList.remove('active'); });
  $('hist-refresh').addEventListener('click', cargarHistorial);
  search.addEventListener('input', render);
  methodFilter.addEventListener('change', render);
  accountFilter.addEventListener('change', cargarHistorial);
  cargarCuentas().then(cargarHistorial);
});
