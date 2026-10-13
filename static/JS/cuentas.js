/* Lógica de interacción de cuentas.html */

(() => {
  const $ = (id) => document.getElementById(id);
  const selForm = $("cuenta-mkt");
  const selFiltro = $("cuentas-filtro");
  const lista = $("cuentas-list");
  const msg = $("form-msg");

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  function mostrarMsg(texto, ok) {
    msg.textContent = texto;
    msg.className = "form-msg " + (ok ? "ok" : "err");
  }

  // Helper para llamar a la API y lanzar error con el mensaje del servidor
  async function api(url, opciones) {
    const res = await fetch(url, opciones);
    let json = null;
    try { json = await res.json(); } catch (_) {}
    if (!res.ok || !json || json.ok === false) {
      throw new Error((json && json.error) || `Error ${res.status}`);
    }
    return json;
  }

  const enviar = (metodo, cuerpo) => ({
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  // ── Marketplaces (llenan los dos <select>) ────────────────
  async function cargarMarketplaces() {
    try {
      const { data } = await api("/api/marketplaces/detalle");
      const opciones = data.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join("");
      selForm.innerHTML = '<option value="">Elige un marketplace</option>' + opciones;
      selFiltro.innerHTML = '<option value="">Todos los marketplaces</option>' + opciones;
    } catch (err) {
      selForm.innerHTML = '<option value="">No se pudieron cargar</option>';
      mostrarMsg("Marketplaces: " + err.message, false);
    }
  }

  // ── Listado de cuentas ────────────────────────────────────
  async function cargarCuentas() {
    const qs = selFiltro.value ? `?marketplace_id=${encodeURIComponent(selFiltro.value)}` : "";
    try {
      const { data } = await api("/api/cuentas" + qs);
      if (!data.length) {
        lista.innerHTML = '<p class="empty">Aún no hay cuentas. Agrega la primera con el formulario.</p>';
        return;
      }
      lista.innerHTML = `
        <div class="card cu-wrap">
          <table class="cu-table">
            <thead>
              <tr><th>Marketplace</th><th>Cuenta</th><th>URL base</th><th>Estado</th><th>Creada</th><th></th></tr>
            </thead>
            <tbody>
              ${data.map((c) => `
                <tr>
                  <td>${esc(c.marketplace)}</td>
                  <td>${esc(c.nombre)}</td>
                  <td class="cu-url">${c.base_url ? esc(c.base_url) : "—"}</td>
                  <td><span class="cu-badge ${c.activo ? "cu-on" : "cu-off"}">${c.activo ? "Activa" : "Inactiva"}</span></td>
                  <td>${esc((c.created_at || "").replace("T", " ").slice(0, 16))}</td>
                  <td>
                    <div class="cu-actions">
                      <button type="button" class="btn-sm" data-accion="toggle" data-id="${c.id}" data-activo="${c.activo ? 1 : 0}">
                        ${c.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" class="btn-sm cu-danger" data-accion="borrar" data-id="${c.id}" data-nombre="${esc(c.nombre)}">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      lista.innerHTML = `<p class="empty cu-danger">No se pudo cargar: ${esc(err.message)}</p>`;
    }
  }

  // ── Crear cuenta ──────────────────────────────────────────
  $("form-cuenta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = $("btn-agregar");
    boton.disabled = true;
    mostrarMsg("", true);
    try {
      await api("/api/cuentas", enviar("POST", {
        marketplace_id: Number(selForm.value),
        nombre: $("cuenta-nombre").value.trim(),
        base_url: $("cuenta-url").value.trim(),
      }));
      $("cuenta-nombre").value = "";
      $("cuenta-url").value = "";
      mostrarMsg("Cuenta guardada", true);
      await cargarCuentas();
    } catch (err) {
      mostrarMsg(err.message, false);
    } finally {
      boton.disabled = false;
    }
  });

  // ── Activar/desactivar y eliminar ─────────────────────────
  lista.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-accion]");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.accion === "toggle") {
        const nuevo = btn.dataset.activo === "1" ? false : true;
        await api(`/api/cuentas/${id}`, enviar("PATCH", { activo: nuevo }));
      } else if (btn.dataset.accion === "borrar") {
        if (!confirm(`¿Eliminar la cuenta "${btn.dataset.nombre}"? Esta acción no se puede deshacer.`)) return;
        await api(`/api/cuentas/${id}`, { method: "DELETE" });
      }
      await cargarCuentas();
    } catch (err) {
      mostrarMsg(err.message, false);
    }
  });

  selFiltro.addEventListener("change", cargarCuentas);

  // ── Inicio ────────────────────────────────────────────────
  (async () => {
    await cargarMarketplaces();
    await cargarCuentas();
  })();
})();
