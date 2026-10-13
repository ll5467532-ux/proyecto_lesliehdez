from contextlib import contextmanager
from datetime import datetime
import json
import os
import re
import time
from urllib.parse import urljoin, urlparse
import requests
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error, IntegrityError, pooling
from config import DB_CONFIG

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # Evita CSS/JS viejos en caché
CORS(app)

# 1. Nombre de la tabla y métodos válidos
TABLA = "endpoints_v2"
METODOS_VALIDOS = {"GET", "POST", "PUT", "PATCH", "DELETE"}

# 2. Columnas pertenecientes a la tabla endpoints_v2 (incluimos id)
COLUMNAS = """
    id, marketplace, endpoint, method, description, params, body, source_url
"""

# Configuración del Pool de Conexiones a la BD 'marketplaces'
pool = pooling.MySQLConnectionPool(
    pool_name="flask_pool",
    pool_size=10,
    pool_reset_session=True,
    **DB_CONFIG,
)


@contextmanager
def get_cursor(dictionary=True):
    """Obtiene una conexión desde el pool y maneja el cursor."""
    con = pool.get_connection()
    cursor = con.cursor(dictionary=dictionary)
    try:
        yield cursor
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        cursor.close()
        con.close()


@app.errorhandler(Error)
def error_bd(e):
    app.logger.error("Error de BD: %s", e)
    return jsonify({"ok": False, "error": f"Error interno de BD: {str(e)}"}), 500


# ═══════════════════════════════════════════════════════════
#  Rutas de Vistas HTML
# ═══════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/marketplaces")
def vista_marketplaces():
    return render_template("marketplaces.html")

@app.route("/cuentas")
def vista_cuentas():
    return render_template("cuentas.html")

@app.route("/autenticaciones")
def vista_autenticaciones():
    return render_template("autenticaciones.html")

@app.route("/endpoints")
def vista_endpoints():
    return render_template("endpoints.html")

@app.route("/historial")
def vista_historial():
    return render_template("historial.html")


# ═══════════════════════════════════════════════════════════
#  API REST
# ═══════════════════════════════════════════════════════════

@app.route("/api")
def api_index():
    return jsonify({
        "ok": True,
        "message": "API de Marketplaces funcionando correctamente",
        "rutas_disponibles": [
            {
                "ruta": "/api/endpoints",
                "metodo": "GET",
                "descripcion": "Buscar endpoints (params: q, marketplace, method)",
            },
            {
                "ruta": "/api/marketplaces",
                "metodo": "GET",
                "descripcion": "Listar todos los marketplaces",
            },
            {
                "ruta": "/api/marketplaces/<nombre>/endpoints",
                "metodo": "GET",
                "descripcion": "Endpoints de un marketplace específico",
            },
            {
                "ruta": "/api/stats",
                "metodo": "GET",
                "descripcion": "Estadísticas por marketplace",
            },
            {
                "ruta": "/api/endpoints/<id>/ejecutar",
                "metodo": "POST",
                "descripcion": "Ejecutar un endpoint real y registrar el resultado en el historial",
            },
            {
                "ruta": "/api/endpoints/<id>/ejecutar",
                "metodo": "POST",
                "descripcion": "Ejecutar un endpoint guardado y registrar el resultado en historial",
            },
        ],
    })


@app.route("/api/endpoints", methods=["GET"])
def search_endpoints():
    query = request.args.get("q", "").strip()[:100]
    marketplace = request.args.get("marketplace", "").strip()
    method = request.args.get("method", "").strip().upper()

    if method and method not in METODOS_VALIDOS:
        return jsonify({"ok": False, "error": "Método no válido"}), 400

    filters = []
    params = []

    if query:
        filters.append(
            "(endpoint LIKE %s OR description LIKE %s OR params LIKE %s)"
        )
        like = f"%{query}%"
        params.extend([like, like, like])

    if marketplace:
        filters.append("marketplace = %s")
        params.append(marketplace)

    if method:
        filters.append("method = %s")
        params.append(method)

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    sql = f"""
        SELECT {COLUMNAS}
        FROM {TABLA}
        {where}
        ORDER BY marketplace, endpoint
        LIMIT 200
    """

    with get_cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return jsonify({"ok": True, "total": len(rows), "data": rows})


@app.route("/api/marketplaces/<marketplace>/endpoints", methods=["GET"])
def get_endpoints_by_marketplace(marketplace):
    method = request.args.get("method", "").strip().upper()

    if method and method not in METODOS_VALIDOS:
        return jsonify({"ok": False, "error": "Método no válido"}), 400

    filters = ["marketplace = %s"]
    params = [marketplace]

    if method:
        filters.append("method = %s")
        params.append(method)

    where = "WHERE " + " AND ".join(filters)

    sql = f"""
        SELECT {COLUMNAS}
        FROM {TABLA}
        {where}
        ORDER BY endpoint
    """

    with get_cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return jsonify({"ok": True, "total": len(rows), "data": rows})


@app.route("/api/marketplaces", methods=["GET"])
def get_marketplaces():
    # El catálogo incluye marketplaces sin endpoints y sincroniza los heredados.
    with get_cursor() as cursor:
        _sincronizar_marketplaces(cursor)
        cursor.execute("SELECT nombre FROM marketplaces ORDER BY nombre")
        rows = [r["nombre"] for r in cursor.fetchall()]
    return jsonify({"ok": True, "data": rows})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    with get_cursor() as cursor:
        cursor.execute(f"""
            SELECT marketplace,
                   COUNT(*) AS total,
                   SUM(CASE WHEN method = 'GET' THEN 1 ELSE 0 END) AS gets,
                   SUM(CASE WHEN method = 'POST' THEN 1 ELSE 0 END) AS posts,
                   SUM(CASE WHEN method IN ('PUT','PATCH') THEN 1 ELSE 0 END) AS puts,
                   SUM(CASE WHEN method = 'DELETE' THEN 1 ELSE 0 END) AS deletes
            FROM {TABLA}
            GROUP BY marketplace
            ORDER BY marketplace
        """)
        rows = cursor.fetchall()
    return jsonify({"ok": True, "data": rows})


# ═══════════════════════════════════════════════════════════
#  Marketplaces, cuentas, autenticaciones e historial
# ═══════════════════════════════════════════════════════════

class ConfigError(Exception):
    """Falta configuración del servidor."""


TIPOS_AUTH = {"oauth2", "api_key", "bearer", "basic", "otro"}
CAMPOS_SECRETOS = re.compile(
    r"authorization|token|api[-_]?key|secret|password|cookie", re.IGNORECASE
)


@app.errorhandler(ConfigError)
def error_config(e):
    return jsonify({"ok": False, "error": str(e)}), 500


@app.errorhandler(IntegrityError)
def error_integridad(e):
    errno = getattr(e, "errno", None)
    if errno == 1062:
        msg = "Ya existe un registro con ese nombre"
    elif errno in (1451, 1452):
        msg = "El registro relacionado no existe o tiene datos asociados"
    else:
        msg = f"Error de integridad en la base de datos: {e}"
    return jsonify({"ok": False, "error": msg}), 400


def _slug(texto):
    s = re.sub(r"[^a-z0-9]+", "-", texto.lower().strip()).strip("-")
    return s or "marketplace"


def _iso(rows, *campos):
    """Convierte fechas a texto ISO sin zona horaria."""
    for r in rows:
        for c in campos:
            if r.get(c) is not None and hasattr(r[c], "isoformat"):
                r[c] = r[c].isoformat()
    return rows


def _fernet():
    key = os.getenv("FERNET_KEY")
    if not key:
        raise ConfigError(
            "Falta FERNET_KEY en tu archivo .env para cifrar las credenciales"
        )
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        raise ConfigError("Instala la librería de cifrado: pip install cryptography")
    try:
        return Fernet(key.encode())
    except Exception:
        raise ConfigError("FERNET_KEY no es válida; genera una nueva")


def _mask(obj):
    """Oculta valores sensibles antes de mostrarlos."""
    if isinstance(obj, dict):
        return {
            k: ("••••••••" if CAMPOS_SECRETOS.search(str(k)) else _mask(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_mask(v) for v in obj]
    return obj


def _json_o_texto(valor):
    if valor is None or isinstance(valor, (dict, list)):
        return valor
    try:
        return json.loads(valor)
    except (TypeError, ValueError):
        return valor


def _body():
    return request.get_json(silent=True) or {}


def _error(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


def _fecha(valor):
    if not valor:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(str(valor).strip(), fmt)
        except ValueError:
            continue
    raise ValueError("Fecha no válida")


def _sincronizar_marketplaces(cursor):
    """
    La tabla `marketplaces` puede estar vacía aunque endpoints_v2 ya tenga datos.
    Copia a `marketplaces` los nombres que existan en endpoints_v2 y falten allá,
    para que las cuentas puedan relacionarse con un marketplace_id real.
    """
    cursor.execute(
        f"SELECT DISTINCT marketplace FROM {TABLA} "
        "WHERE marketplace IS NOT NULL AND marketplace <> ''"
    )
    en_endpoints = [r["marketplace"] for r in cursor.fetchall()]

    cursor.execute("SELECT nombre FROM marketplaces")
    existentes = {r["nombre"].lower() for r in cursor.fetchall()}

    for nombre in en_endpoints:
        if nombre.lower() not in existentes:
            cursor.execute(
                "INSERT INTO marketplaces (nombre, slug, auth_tipo) VALUES (%s, %s, %s)",
                (nombre, _slug(nombre), "otro"),
            )
            existentes.add(nombre.lower())


# ── Marketplaces ───────────────────────────────────────────
@app.route("/api/marketplaces/detalle", methods=["GET"])
def marketplaces_detalle():
    with get_cursor() as cursor:
        _sincronizar_marketplaces(cursor)
        cursor.execute("""
            SELECT m.id, m.nombre, m.slug, m.docs_url, m.auth_tipo,
                   (SELECT COUNT(*) FROM endpoints_v2 e WHERE e.marketplace = m.nombre) AS endpoints,
                   (SELECT COUNT(*) FROM cuentas c WHERE c.marketplace_id = m.id) AS cuentas
            FROM marketplaces m
            ORDER BY m.nombre
        """)
        rows = cursor.fetchall()
    return jsonify({"ok": True, "total": len(rows), "data": rows})


@app.route("/api/marketplaces", methods=["POST"])
def crear_marketplace():
    d = _body()
    nombre = (d.get("nombre") or "").strip()
    if not nombre or len(nombre) > 100:
        return _error("Escribe un nombre de hasta 100 caracteres")
    auth_tipo = d.get("auth_tipo") or "otro"
    if auth_tipo not in TIPOS_AUTH:
        return _error("Tipo de autenticación no válido")
    docs_url = (d.get("docs_url") or "").strip() or None
    if docs_url and not docs_url.lower().startswith(("http://", "https://")):
        return _error("La URL debe empezar con http:// o https://")

    with get_cursor() as cursor:
        cursor.execute(
            "INSERT INTO marketplaces (nombre, slug, docs_url, auth_tipo) "
            "VALUES (%s, %s, %s, %s)",
            (nombre, _slug(nombre), docs_url, auth_tipo),
        )
        nuevo_id = cursor.lastrowid
    return jsonify({"ok": True, "id": nuevo_id}), 201


# ── Cuentas ────────────────────────────────────────────────
@app.route("/api/cuentas", methods=["GET"])
def listar_cuentas():
    marketplace_id = request.args.get("marketplace_id", type=int)
    sql = """
        SELECT c.id, c.nombre, c.base_url, c.activo, c.created_at,
               m.id AS marketplace_id, m.nombre AS marketplace
        FROM cuentas c
        JOIN marketplaces m ON m.id = c.marketplace_id
    """
    params = []
    if marketplace_id:
        sql += " WHERE c.marketplace_id = %s"
        params.append(marketplace_id)
    sql += " ORDER BY m.nombre, c.nombre"
    with get_cursor() as cursor:
        cursor.execute(sql, params)
        rows = _iso(cursor.fetchall(), "created_at")
    return jsonify({"ok": True, "total": len(rows), "data": rows})


@app.route("/api/cuentas", methods=["POST"])
def crear_cuenta():
    d = _body()
    try:
        marketplace_id = int(d.get("marketplace_id"))
    except (TypeError, ValueError):
        return _error("Elige un marketplace")
    nombre = (d.get("nombre") or "").strip()
    if not nombre or len(nombre) > 120:
        return _error("Escribe un nombre de hasta 120 caracteres")
    base_url = (d.get("base_url") or "").strip() or None
    if base_url and not base_url.lower().startswith(("http://", "https://")):
        return _error("La URL base debe empezar con http:// o https://")

    with get_cursor() as cursor:
        cursor.execute("SELECT id FROM marketplaces WHERE id = %s", (marketplace_id,))
        if not cursor.fetchone():
            return _error("El marketplace elegido no existe", 404)
        cursor.execute(
            "INSERT INTO cuentas (marketplace_id, nombre, base_url) VALUES (%s, %s, %s)",
            (marketplace_id, nombre, base_url),
        )
        nuevo_id = cursor.lastrowid
    return jsonify({"ok": True, "id": nuevo_id}), 201


@app.route("/api/cuentas/<int:cuenta_id>", methods=["PATCH"])
def editar_cuenta(cuenta_id):
    d = _body()
    sets, params = [], []
    if "activo" in d:
        sets.append("activo = %s")
        params.append(1 if d["activo"] else 0)
    if "nombre" in d:
        nombre = (d["nombre"] or "").strip()
        if not nombre or len(nombre) > 120:
            return _error("Escribe un nombre de hasta 120 caracteres")
        sets.append("nombre = %s")
        params.append(nombre)
    if "base_url" in d:
        sets.append("base_url = %s")
        params.append((d["base_url"] or "").strip() or None)
    if not sets:
        return _error("No hay cambios que guardar")

    with get_cursor() as cursor:
        cursor.execute("SELECT id FROM cuentas WHERE id = %s", (cuenta_id,))
        if not cursor.fetchone():
            return _error("La cuenta no existe", 404)
        cursor.execute(
            f"UPDATE cuentas SET {', '.join(sets)} WHERE id = %s",
            params + [cuenta_id],
        )
    return jsonify({"ok": True})


@app.route("/api/cuentas/<int:cuenta_id>", methods=["DELETE"])
def borrar_cuenta(cuenta_id):
    with get_cursor() as cursor:
        cursor.execute("DELETE FROM cuentas WHERE id = %s", (cuenta_id,))
        borradas = cursor.rowcount
    if not borradas:
        return _error("La cuenta no existe", 404)
    return jsonify({"ok": True})


# ── Autenticaciones ─────────────────────────────────────────
@app.route("/api/autenticaciones", methods=["GET"])
def listar_autenticaciones():
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT a.id, a.cuenta_id, c.nombre AS cuenta, m.nombre AS marketplace,
                   a.tipo, a.expira_en, a.activo, a.created_at
            FROM autenticaciones a
            JOIN cuentas c ON c.id = a.cuenta_id
            JOIN marketplaces m ON m.id = c.marketplace_id
            ORDER BY a.created_at DESC
        """)
        rows = _iso(cursor.fetchall(), "expira_en", "created_at")
    return jsonify({"ok": True, "total": len(rows), "data": rows})


@app.route("/api/autenticaciones", methods=["POST"])
def crear_autenticacion():
    d = _body()
    try:
        cuenta_id = int(d.get("cuenta_id"))
    except (TypeError, ValueError):
        return _error("Elige una cuenta")
    tipo = d.get("tipo")
    if tipo not in TIPOS_AUTH:
        return _error("Elige un tipo de autenticación")
    credenciales = (d.get("credenciales") or "").strip()
    if not credenciales or len(credenciales) > 5000:
        return _error("Pega la credencial (máximo 5,000 caracteres)")
    try:
        expira_en = _fecha(d.get("expira_en"))
    except ValueError:
        return _error("La fecha de vencimiento no es válida")

    cifrada = _fernet().encrypt(credenciales.encode("utf-8")).decode("utf-8")
    with get_cursor() as cursor:
        cursor.execute(
            "INSERT INTO autenticaciones (cuenta_id, tipo, credenciales_cifradas, expira_en) "
            "VALUES (%s, %s, %s, %s)",
            (cuenta_id, tipo, cifrada, expira_en),
        )
        nuevo_id = cursor.lastrowid
    return jsonify({"ok": True, "id": nuevo_id}), 201


@app.route("/api/autenticaciones/<int:auth_id>", methods=["PATCH"])
def editar_autenticacion(auth_id):
    d = _body()
    if "activo" not in d:
        return _error("No hay cambios que guardar")
    with get_cursor() as cursor:
        cursor.execute("SELECT id FROM autenticaciones WHERE id = %s", (auth_id,))
        if not cursor.fetchone():
            return _error("La autenticación no existe", 404)
        cursor.execute(
            "UPDATE autenticaciones SET activo = %s WHERE id = %s",
            (1 if d["activo"] else 0, auth_id),
        )
    return jsonify({"ok": True})


@app.route("/api/autenticaciones/<int:auth_id>", methods=["DELETE"])
def borrar_autenticacion(auth_id):
    with get_cursor() as cursor:
        cursor.execute("DELETE FROM autenticaciones WHERE id = %s", (auth_id,))
        borradas = cursor.rowcount
    if not borradas:
        return _error("La autenticación no existe", 404)
    return jsonify({"ok": True})



# ── Ejecución real de endpoints y registro en historial ──────
def _cargar_json_config(valor, predeterminado):
    """Convierte JSON guardado en la BD; conserva texto plano si no es JSON."""
    if valor is None or valor == "":
        return predeterminado
    if isinstance(valor, (dict, list)):
        return valor
    try:
        return json.loads(valor)
    except (TypeError, ValueError):
        return predeterminado


def _obtener_credenciales(cuenta_id):
    """Descifra las credenciales activas de una cuenta sin devolverlas al cliente."""
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT tipo, credenciales_cifradas, expira_en
            FROM autenticaciones
            WHERE cuenta_id = %s AND activo = 1
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """, (cuenta_id,))
        fila = cursor.fetchone()

    if not fila:
        return None, None

    if fila.get("expira_en") and fila["expira_en"] < datetime.now():
        raise ConfigError("La autenticación guardada ya expiró")

    try:
        credenciales = _fernet().decrypt(
            fila["credenciales_cifradas"].encode("utf-8")
        ).decode("utf-8")
    except Exception:
        raise ConfigError("No se pudieron descifrar las credenciales; revisa FERNET_KEY")

    return fila["tipo"], _json_o_texto(credenciales)


def _aplicar_autenticacion(headers, params, auth_tipo, credenciales):
    """Aplica formatos comunes de autenticación; nunca expone secretos en la respuesta."""
    if not auth_tipo or credenciales is None:
        return headers, params

    c = credenciales if isinstance(credenciales, dict) else {"token": str(credenciales)}
    if auth_tipo in ("bearer", "oauth2"):
        token = c.get("access_token") or c.get("token") or c.get("bearer_token")
        if not token:
            raise ConfigError("La credencial Bearer/OAuth2 debe incluir token o access_token")
        headers["Authorization"] = f"Bearer {token}"
    elif auth_tipo == "api_key":
        clave = c.get("key") or c.get("name") or "X-API-Key"
        valor = c.get("value") or c.get("api_key") or c.get("apiKey") or c.get("token")
        if not valor:
            raise ConfigError("La credencial API Key debe incluir value, api_key o token")
        if str(c.get("in", "header")).lower() == "query":
            params[clave] = valor
        else:
            headers[clave] = valor
    elif auth_tipo == "basic":
        usuario, password = c.get("username"), c.get("password")
        if usuario is None or password is None:
            raise ConfigError("La autenticación Basic debe incluir username y password")
        import base64
        encoded = base64.b64encode(f"{usuario}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"
    return headers, params


@app.route("/api/endpoints/<int:endpoint_id>/ejecutar", methods=["POST"])
def ejecutar_endpoint(endpoint_id):
    """
    Ejecuta el endpoint guardado en endpoints_v2 usando una cuenta seleccionada.
    JSON opcional: {"cuenta_id": 1, "params": {}, "body": {}, "headers": {}}.
    El resultado y el código HTTP se guardan en `historial`.
    """
    d = _body()
    try:
        cuenta_id = int(d.get("cuenta_id"))
    except (TypeError, ValueError):
        return _error("Debes seleccionar una cuenta para ejecutar el endpoint")

    with get_cursor() as cursor:
        cursor.execute(f"SELECT {COLUMNAS} FROM {TABLA} WHERE id = %s", (endpoint_id,))
        endpoint_row = cursor.fetchone()
        if not endpoint_row:
            return _error("El endpoint no existe en la base de datos", 404)

        cursor.execute("""
            SELECT c.id, c.nombre, c.base_url, c.activo, m.nombre AS marketplace
            FROM cuentas c
            JOIN marketplaces m ON m.id = c.marketplace_id
            WHERE c.id = %s
        """, (cuenta_id,))
        cuenta = cursor.fetchone()

    if not cuenta:
        return _error("La cuenta seleccionada no existe", 404)
    if not cuenta.get("activo"):
        return _error("La cuenta está desactivada", 400)
    if cuenta["marketplace"].strip().lower() != str(endpoint_row["marketplace"]).strip().lower():
        return _error("La cuenta seleccionada no pertenece a este marketplace", 400)

    metodo = str(endpoint_row.get("method") or "GET").upper()
    if metodo not in METODOS_VALIDOS:
        return _error("El método guardado para este endpoint no es válido", 400)

    ruta = str(endpoint_row.get("endpoint") or "").strip()
    if not ruta:
        return _error("El endpoint no tiene una ruta guardada", 400)
    base_url = (cuenta.get("base_url") or "").strip()
    if ruta.startswith(("https://", "http://")):
        url = ruta
    elif base_url:
        url = urljoin(base_url.rstrip("/") + "/", ruta.lstrip("/"))
    else:
        return _error("La cuenta no tiene una URL base configurada", 400)

    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        return _error("La URL final del endpoint no es válida", 400)

    params_db = _cargar_json_config(endpoint_row.get("params"), {})
    body_db = _cargar_json_config(endpoint_row.get("body"), {})
    params = dict(params_db) if isinstance(params_db, dict) else {}
    body = body_db if isinstance(body_db, (dict, list)) else {}
    # Los valores enviados al ejecutar pueden complementar/sobrescribir los guardados.
    params.update(d.get("params") if isinstance(d.get("params"), dict) else {})
    body_override = d.get("body", body)
    headers = {"Accept": "application/json"}
    if isinstance(d.get("headers"), dict):
        headers.update({str(k): str(v) for k, v in d["headers"].items()
                        if not CAMPOS_SECRETOS.search(str(k))})
    auth_tipo = None
    credenciales = None
    try:
        auth_tipo, credenciales = _obtener_credenciales(cuenta_id)
        headers, params = _aplicar_autenticacion(headers, params, auth_tipo, credenciales)
    except ConfigError as exc:
        return _error(str(exc), 400)

    inicio = time.perf_counter()
    status_code = None
    respuesta_texto = ""
    respuesta_json = None
    error_peticion = None
    try:
        resp = requests.request(
            method=metodo,
            url=url,
            params=params,
            json=body_override if metodo in {"POST", "PUT", "PATCH", "DELETE"} and body_override not in ({}, None, "") else None,
            headers=headers,
            timeout=(5, 25),
            allow_redirects=False,
        )
        status_code = resp.status_code
        try:
            respuesta_json = _mask(resp.json())
            respuesta_texto = json.dumps(respuesta_json, ensure_ascii=False, default=str)[:20000]
        except ValueError:
            respuesta_texto = resp.text[:20000]
    except requests.RequestException as exc:
        error_peticion = str(exc)[:1000]
        respuesta_texto = json.dumps({"error": "No se pudo completar la petición", "detalle": error_peticion},
                                     ensure_ascii=False)

    duracion_ms = int((time.perf_counter() - inicio) * 1000)
    # Se guardan headers enmascarados; no se persisten tokens ni secretos en claro.
    headers_registro = _mask(headers)
    request_body_registro = {
        "url": url,
        "method": metodo,
        "params": _mask(params),
        "body": _mask(body_override),
    }
    with get_cursor() as cursor:
        cursor.execute("""
            INSERT INTO historial
                (cuenta_id, endpoint_id, status_code, duracion_ms,
                 request_body, headers, respuesta)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            cuenta_id, endpoint_id, status_code, duracion_ms,
            json.dumps(request_body_registro, ensure_ascii=False, default=str),
            json.dumps(headers_registro, ensure_ascii=False, default=str),
            respuesta_texto,
        ))
        historial_id = cursor.lastrowid

    if error_peticion:
        return jsonify({
            "ok": False, "historial_id": historial_id,
            "error": "No se pudo completar la petición al marketplace",
            "detalle": error_peticion, "duracion_ms": duracion_ms,
        }), 502

    if respuesta_json is None:
        respuesta_json = respuesta_texto
    return jsonify({
        "ok": 200 <= status_code < 300,
        "historial_id": historial_id,
        "marketplace": endpoint_row["marketplace"],
        "endpoint_id": endpoint_id,
        "cuenta": cuenta["nombre"],
        "method": metodo,
        "status_code": status_code,
        "duracion_ms": duracion_ms,
        "respuesta": respuesta_json,
    }), 200


# ── Historial ──────────────────────────────────────────────
@app.route("/api/historial", methods=["GET"])
def listar_historial():
    cuenta_id = request.args.get("cuenta_id", type=int)
    limite = max(1, min(request.args.get("limit", 50, type=int), 200))
    sql = """
        SELECT h.id, h.cuenta_id, h.endpoint_id,
               h.status_code AS status, h.duracion_ms,
               h.ejecutado_en AS fecha,
               c.nombre AS cuenta, e.marketplace, e.method, e.endpoint
        FROM historial h
        JOIN cuentas c ON c.id = h.cuenta_id
        JOIN endpoints_v2 e ON e.id = h.endpoint_id
    """
    params = []
    if cuenta_id:
        sql += " WHERE h.cuenta_id = %s"
        params.append(cuenta_id)
    sql += " ORDER BY h.ejecutado_en DESC LIMIT %s"
    params.append(limite)
    with get_cursor() as cursor:
        cursor.execute(sql, params)
        rows = _iso(cursor.fetchall(), "fecha")
    return jsonify({"ok": True, "total": len(rows), "data": rows})

@app.route("/api/historial/<int:hist_id>", methods=["GET"])
def detalle_historial(hist_id):
    with get_cursor() as cursor:
        cursor.execute(
            "SELECT id, request_body, headers, respuesta FROM historial WHERE id = %s",
            (hist_id,),
        )
        fila = cursor.fetchone()
    if not fila:
        return _error("El registro no existe", 404)
    respuesta = fila["respuesta"]
    if isinstance(respuesta, str) and len(respuesta) > 20000:
        respuesta = respuesta[:20000] + "\n… (respuesta recortada)"
    return jsonify({
        "ok": True,
        "data": {
            "id": fila["id"],
            "request_body": _mask(_json_o_texto(fila["request_body"])),
            "headers": _mask(_json_o_texto(fila["headers"])),
            "respuesta": respuesta,
        },
    })


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, port=5000, host="0.0.0.0")