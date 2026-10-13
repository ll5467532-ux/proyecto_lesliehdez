/* Lógica de interacción de autenticaciones.html */

(() => {
  const $ = (id) => document.getElementById(id);
  const selCuenta = $("auth-cuenta");
  const lista = $("auth-list");
  const msg = $("auth-msg");

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const fmt = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

  function mostrarMsg(texto, ok) {
    msg.textContent = texto;
    msg.className = "form-msg " + (ok ? "ok" : "err");
  }

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

  async function cargarCuentas() {
    try {
      const { data } = await api("/api/cuentas");
      if (!data.length) {
        selCuenta.innerHTML = '<option value="">No hay cuentas activas</option>';
        return;
      }
      selCuenta.innerHTML =
        '<option value="">Elige una cuenta</option>' +
        data.map((c) =>
          `<option value="${c.id}">${esc(c.marketplace)} · ${esc(c.nombre)}${c.activo ? "" : " (inactiva)"}</option>`
        ).join("");
    } catch (err) {
      selCuenta.innerHTML = '<option value="">No se pudieron cargar</option>';
      mostrarMsg("Cuentas: " + err.message, false);
    }
  }

  async function cargarAutenticaciones() {
    try {
      const { data } = await api("/api/autenticaciones");
      if (!data.length) {
        lista.innerHTML = '<div class="card empty">Aún no hay credenciales guardadas.</div>';
        return;
      }
      const ahora = new Date();
      lista.innerHTML = `
        <div class="card au-wrap">
          <table class="au-table">
            <thead>
              <tr><th>Marketplace</th><th>Cuenta</th><th>Tipo</th><th>Vence</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${data.map((a) => {
                const vencida = a.expira_en && new Date(a.expira_en) < ahora;
                const estado = vencida
                  ? '<span class="au-badge au-exp"><i class="fa-solid fa-triangle-exclamation"></i> Vencida</span>'
                  : a.activo
                    ? '<span class="au-badge au-on"><i class="fa-solid fa-circle-check"></i> Activa</span>'
                    : '<span class="au-badge au-off"><i class="fa-solid fa-circle-minus"></i> Inactiva</span>';
                return `
                <tr>
                  <td><strong>${esc(a.marketplace)}</strong></td>
                  <td>${esc(a.cuenta)}</td>
                  <td class="au-tipo">${esc(a.tipo)}</td>
                  <td>${fmt(a.expira_en)}</td>
                  <td>${estado}</td>
                  <td>${fmt(a.created_at)}</td>
                  <td>
                    <div class="au-actions">
                      <button type="button" class="btn-sm" data-accion="toggle" data-id="${a.id}" data-activo="${a.activo ? 1 : 0}">
                        ${a.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" class="btn-sm au-danger" data-accion="borrar" data-id="${a.id}" data-nombre="${esc(a.cuenta)}">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      lista.innerHTML = `<div class="card empty" style="color:#d64545">No se pudo cargar: ${esc(err.message)}</div>`;
    }
  }

  $("form-auth").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = $("btn-guardar");
    boton.disabled = true;
    mostrarMsg("", true);
    try {
      await api("/api/autenticaciones", enviar("POST", {
        cuenta_id: Number(selCuenta.value),
        tipo: $("auth-tipo").value,
        credenciales: $("auth-cred").value.trim(),
        expira_en: $("auth-expira").value || null,
      }));
      $("auth-cred").value = "";
      $("auth-expira").value = "";
      mostrarMsg("Credencial guardada de forma segura", true);
      await cargarAutenticaciones();
    } catch (err) {
      mostrarMsg(err.message, false);
    } finally {
      boton.disabled = false;
    }
  });

  lista.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-accion]");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.accion === "toggle") {
        await api(`/api/autenticaciones/${id}`, enviar("PATCH", { activo: btn.dataset.activo !== "1" }));
      } else if (btn.dataset.accion === "borrar") {
        if (!confirm(`¿Eliminar la credencial de "${btn.dataset.nombre}"?`)) return;
        await api(`/api/autenticaciones/${id}`, { method: "DELETE" });
      }
      await cargarAutenticaciones();
    } catch (err) {
      mostrarMsg(err.message, false);
    }
  });

  cargarCuentas();
  cargarAutenticaciones();
})();
