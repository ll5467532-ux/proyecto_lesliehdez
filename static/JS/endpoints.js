/* Lógica de interacción de endpoints.html */

(() => {
  const $ = (id) => document.getElementById(id);
  const qInput = $("q");
  const cards = $("cards");
  const info = $("results-info");

  let marketplace = "";
  let method = "";
  let timer = null;

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const pretty = (v) => {
    if (!v) return "";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return String(v); }
  };

  function renderCard(e) {
    const params = pretty(e.params);
    const body = pretty(e.body);
    const m = esc(e.method);
    return `
      <div class="ep-card">
        <div class="ep-head">
          <span class="ep-method ep-${m}">${m}</span>
          <span class="ep-path">${esc(e.endpoint)}</span>
          <span class="ep-mkt">${esc(e.marketplace)}</span>
        </div>
        ${e.description ? `<p class="ep-desc">${esc(e.description)}</p>` : ""}
        ${params ? `<div class="ep-extra"><b>Parámetros</b><pre>${esc(params)}</pre></div>` : ""}
        ${body ? `<div class="ep-extra"><b>Body</b><pre>${esc(body)}</pre></div>` : ""}
        ${e.source_url ? `<div class="ep-extra"><a href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">Ver Documentación ↗</a></div>` : ""}
        <div class="ep-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn-sm primary js-ejecutar" data-id="${Number(e.id)}"
            data-marketplace="${esc(e.marketplace)}" data-method="${m}" data-endpoint="${esc(e.endpoint)}">
            Ejecutar petición
          </button>
        </div>
      </div>`;
  }

  async function buscar() {
    const qs = new URLSearchParams();
    if (qInput.value.trim()) qs.set("q", qInput.value.trim());
    if (marketplace) qs.set("marketplace", marketplace);
    if (method) qs.set("method", method);

    try {
      const res = await fetch("/api/endpoints?" + qs.toString());
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error al cargar endpoints");

      info.style.display = "block";
      info.textContent = `${json.total} resultado${json.total === 1 ? "" : "s"} encontrado${json.total === 1 ? "" : "s"}`;
      cards.innerHTML = json.data.length
        ? json.data.map(renderCard).join("")
        : '<div class="card empty">No se encontraron endpoints para esta búsqueda.</div>';
    } catch (err) {
      info.style.display = "none";
      cards.innerHTML = `<div class="card empty" style="color:#d64545">Error: ${esc(err.message)}</div>`;
    }
  }

  function limpiar() {
    qInput.value = "";
    marketplace = "";
    method = "";
    document.querySelectorAll("#mkt-pills .mkt-pill").forEach((p) => p.classList.toggle("active", p.dataset.mkt === ""));
    document.querySelectorAll("#method-pills .mkt-pill").forEach((p) => p.classList.toggle("active", p.dataset.method === ""));
    buscar();
  }

  $("mkt-pills").addEventListener("click", (ev) => {
    const pill = ev.target.closest(".mkt-pill");
    if (!pill) return;
    document.querySelectorAll("#mkt-pills .mkt-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    marketplace = pill.dataset.mkt;
    buscar();
  });

  $("method-pills").addEventListener("click", (ev) => {
    const pill = ev.target.closest(".mkt-pill");
    if (!pill) return;
    document.querySelectorAll("#method-pills .mkt-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    method = pill.dataset.method;
    buscar();
  });

  $("btn-buscar").addEventListener("click", buscar);
  $("btn-limpiar").addEventListener("click", limpiar);
  qInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") buscar(); });
  qInput.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(buscar, 300); });

  async function cargarMarketplaces() {
    try {
      const res = await fetch("/api/marketplaces");
      const json = await res.json();
      if (!json.ok) return;
      const cont = $("mkt-pills");
      json.data.forEach((nombre) => {
        const div = document.createElement("div");
        div.className = "mkt-pill";
        div.dataset.mkt = nombre;
        div.textContent = nombre;
        cont.appendChild(div);
      });
    } catch (_) {}
  }

  // Modal de ejecución: los valores en blanco respetan los guardados en la BD.
  const modal = document.createElement("div");
  modal.id = "ejecucion-modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px";
  modal.innerHTML = `
    <section style="background:#fff;border-radius:14px;width:min(760px,100%);max-height:92vh;overflow:auto;padding:22px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
        <div><h2 style="margin:0">Ejecutar endpoint</h2><p id="run-subtitle" style="margin:6px 0;color:#64748b"></p></div>
        <button type="button" id="run-close" class="btn-sm">Cerrar</button>
      </div>
      <label style="display:block;margin-top:14px;font-weight:600">Cuenta del marketplace</label>
      <select id="run-account" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px"></select>
      <label style="display:block;margin-top:14px;font-weight:600">Parámetros JSON (opcional; vacío = usar los guardados)</label>
      <textarea id="run-params" rows="3" placeholder='{"limit": 10}' style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:monospace"></textarea>
      <label style="display:block;margin-top:14px;font-weight:600">Cuerpo JSON (opcional; vacío = usar el guardado)</label>
      <textarea id="run-body" rows="4" placeholder='{"title": "Producto de prueba"}' style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:monospace"></textarea>
      <p id="run-message" role="status" style="white-space:pre-wrap;color:#475569"></p>
      <button type="button" id="run-submit" class="btn-sm primary">Enviar petición real</button>
      <h3 style="margin:18px 0 8px">Respuesta</h3>
      <pre id="run-response" style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;max-height:280px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">Todavía no se ha ejecutado.</pre>
    </section>`;
  document.body.appendChild(modal);
  const runAccount = modal.querySelector("#run-account");
  let selectedEndpoint = null;

  async function abrirEjecucion(e) {
    selectedEndpoint = e;
    modal.querySelector("#run-subtitle").textContent = `${e.dataset.marketplace} · ${e.dataset.method} ${e.dataset.endpoint}`;
    modal.querySelector("#run-message").textContent = "";
    modal.querySelector("#run-response").textContent = "Todavía no se ha ejecutado.";
    modal.querySelector("#run-params").value = "";
    modal.querySelector("#run-body").value = "";
    runAccount.innerHTML = '<option value="">Cargando cuentas…</option>';
    modal.style.display = "flex";
    try {
      const r = await fetch("/api/cuentas");
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "No se pudieron cargar las cuentas.");
      const accounts = (j.data || []).filter(a => a.activo && String(a.marketplace).toLowerCase() === String(e.dataset.marketplace).toLowerCase());
      runAccount.innerHTML = accounts.length
        ? '<option value="">Selecciona una cuenta</option>' + accounts.map(a => `<option value="${Number(a.id)}">${esc(a.nombre)} — ${esc(a.base_url || "sin URL base")}</option>`).join("")
        : '<option value="">No hay cuentas activas para este marketplace</option>';
    } catch (err) {
      runAccount.innerHTML = '<option value="">Error cargando cuentas</option>';
      modal.querySelector("#run-message").textContent = err.message;
    }
  }

  modal.querySelector("#run-close").addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", ev => { if (ev.target === modal) modal.style.display = "none"; });
  cards.addEventListener("click", ev => {
    const button = ev.target.closest(".js-ejecutar");
    if (button) abrirEjecucion(button);
  });
  modal.querySelector("#run-submit").addEventListener("click", async () => {
    if (!selectedEndpoint) return;
    const cuentaId = runAccount.value;
    if (!cuentaId) {
      modal.querySelector("#run-message").textContent = "Selecciona una cuenta activa.";
      return;
    }
    const method = selectedEndpoint.dataset.method;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
        !confirm(`Vas a ejecutar una petición ${method} real en ${selectedEndpoint.dataset.marketplace}. Puede modificar o eliminar datos. ¿Continuar?`)) return;

    const payload = { cuenta_id: Number(cuentaId) };
    for (const [field, id] of [["params", "run-params"], ["body", "run-body"]]) {
      const raw = modal.querySelector("#" + id).value.trim();
      if (raw) {
        try { payload[field] = JSON.parse(raw); }
        catch (_) {
          modal.querySelector("#run-message").textContent = `El campo ${field} no contiene JSON válido.`;
          return;
        }
        if (field === "params" && (!payload[field] || Array.isArray(payload[field]) || typeof payload[field] !== "object")) {
          modal.querySelector("#run-message").textContent = "Los parámetros deben ser un objeto JSON.";
          return;
        }
      }
    }

    const button = modal.querySelector("#run-submit");
    button.disabled = true;
    button.textContent = "Ejecutando…";
    modal.querySelector("#run-message").textContent = "Enviando petición al marketplace y guardando el resultado en el historial…";
    modal.querySelector("#run-response").textContent = "";
    try {
      const r = await fetch(`/api/endpoints/${Number(selectedEndpoint.dataset.id)}/ejecutar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const j = await r.json();
      modal.querySelector("#run-response").textContent = JSON.stringify(j, null, 2);
      modal.querySelector("#run-message").textContent = j.ok
        ? `Petición completada. HTTP ${j.status_code}; ${j.duracion_ms} ms. Registro de historial: ${j.historial_id}.`
        : `La petición no fue exitosa. ${j.error || "Revisa la respuesta y el historial."}${j.status_code ? ` HTTP ${j.status_code}.` : ""}`;
    } catch (err) {
      modal.querySelector("#run-message").textContent = "No se pudo contactar a Neurotry: " + err.message;
    } finally {
      button.disabled = false;
      button.textContent = "Enviar petición real";
    }
  });

  cargarMarketplaces();
  buscar();
})();
