/* Lógica de interacción de marketplaces.html */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('marketplaces-container');
    const searchInput = document.getElementById('mp-search');
    const btnReset = document.getElementById('mp-btn-reset');

    // Elementos del Modal
    const btnOpenModal = document.getElementById('btn-open-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const modal = document.getElementById('add-mp-modal');
    const addForm = document.getElementById('add-mp-form');

    let cacheData = [];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));

    async function cargarMarketplaces() {
      try {
        const res = await fetch('/api/marketplaces/detalle');
        const json = await res.json();

        if (json.ok && json.data) {
          cacheData = json.data.map(item => ({
            id: Number(item.id),
            nombre: item.nombre,
            estado: 'activo',
            tipo: item.auth_tipo || 'otro',
            endpoints_count: Number(item.endpoints || 0),
            cuentas: Number(item.cuentas || 0)
          }));

          renderMarketplaces(cacheData);
        } else {
          container.innerHTML = '<div style="padding: 3rem; text-align: center; color: #64748b; background: #fff; border-radius: 12px;">No hay marketplaces configurados.</div>';
        }
      } catch (e) {
        container.innerHTML = '<div style="padding: 3rem; text-align: center; color: #ef4444; background: #fff; border-radius: 12px;">Error al conectar con la API.</div>';
      }
    }

    function renderMarketplaces(items) {
      document.getElementById('stat-total').textContent = items.length;
      document.getElementById('stat-activos').textContent = items.reduce((total, item) => total + Number(item.endpoints_count || 0), 0);

      if (items.length === 0) {
        container.innerHTML = '<div style="padding: 3rem; text-align: center; color: #64748b; background: #fff; border-radius: 12px;">No se encontraron coincidencias.</div>';
        return;
      }

      container.innerHTML = `
        <div class="mp-grid">
          ${items.map(mp => `
            <div class="mp-card">
              <div>
                <div class="mp-header">
                  <div class="mp-icon">🛍️</div>
                  <div>
                    <div class="mp-title">${esc(mp.nombre)}</div>
                    <span class="badge badge-success" style="margin-top: 0.25rem; display: inline-block;">Activo</span>
                  </div>
                </div>
                <div class="mp-desc">
                  Integración lista con <strong>${mp.endpoints_count} endpoints</strong> registrados y <strong>${mp.cuentas} cuentas</strong> configuradas.
                </div>
              </div>
              <div class="mp-footer">
                <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">${esc(mp.tipo || 'otro')}</span>
                <a href="/endpoints?marketplace=${encodeURIComponent(mp.nombre)}" class="btn btn-secondary btn-sm">Explorar &rarr;</a>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function aplicarFiltros() {
      const q = searchInput.value.toLowerCase().trim();
      const filtrados = cacheData.filter(mp => mp.nombre.toLowerCase().includes(q));

      renderMarketplaces(filtrados);
    }

    // Modal Control
    btnOpenModal.addEventListener('click', () => modal.classList.add('active'));
    btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    // El marketplace solo se agrega si el backend confirma que MySQL lo guardó.
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('new-mp-nombre').value.trim();
      const auth_tipo = document.getElementById('new-mp-tipo').value;
      if (!nombre) return;

      const submit = addForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const res = await fetch('/api/marketplaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, auth_tipo })
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo guardar el marketplace.');
        modal.classList.remove('active');
        addForm.reset();
        await cargarMarketplaces();
      } catch (err) {
        alert(err.message || 'No se pudo guardar el marketplace.');
      } finally {
        submit.disabled = false;
      }
    });

    searchInput.addEventListener('input', aplicarFiltros);
    btnReset.addEventListener('click', () => {
      searchInput.value = '';
      renderMarketplaces(cacheData);
    });

    cargarMarketplaces();
  });
