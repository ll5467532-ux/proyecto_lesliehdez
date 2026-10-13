# Neurotry — integración de endpoints de marketplaces

## Qué incorpora esta versión
- Ejecución real de endpoints guardados en `endpoints_v2` desde la pantalla **Endpoints**.
- Selección de una cuenta activa del marketplace correcto.
- Parámetros y cuerpo JSON opcionales; si se dejan vacíos, se usan los valores almacenados en MySQL.
- Autenticación mediante Bearer/OAuth2 con token existente, API Key y Basic Auth.
- Registro de solicitudes, respuesta, código HTTP y duración en `historial`.
- Detalle de historial desde la interfaz, sin registros de demostración falsos.
- El scraper ya no borra los endpoints guardados y evita insertar duplicados exactos.
- Configuración MySQL tomada desde variables de entorno, compatible con Docker Compose.

## 1. Preparar la configuración local
1. Haz una copia de seguridad de tu base de datos antes de cambiar el esquema.
2. Copia `.env.example` y renómbralo a `.env`.
3. Completa `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
4. Genera una clave Fernet con:
   ```bash
   py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
5. Pega la clave generada en `FERNET_KEY` dentro de `.env`. Conserva esta clave: si la pierdes, no podrás descifrar las credenciales guardadas.

No compartas `.env`, tokens ni contraseñas. La clave Fernet debe mantenerse igual mientras existan credenciales cifradas.

## 2. Aplicar el esquema de MySQL
`schema.sql` usa `CREATE TABLE IF NOT EXISTS` y no elimina tablas. También intenta migrar los registros de la tabla antigua `endpoints` a `endpoints_v2`.

Antes de ejecutarlo, exporta un respaldo de tu base de datos. En phpMyAdmin, selecciona la base `marketplaces`, abre la pestaña **SQL**, pega/ejecuta el contenido de `schema.sql` o impórtalo desde la pestaña **Importar**.

Si usas un contenedor Docker que ya tenía creado el volumen `db_data`, MySQL no vuelve a ejecutar automáticamente los scripts de inicialización. En ese caso, importa `schema.sql` manualmente. No elimines el volumen para forzar la inicialización si contiene datos que necesitas.

## 3. Instalar dependencias y arrancar en Windows
En la terminal de VS Code, dentro de esta carpeta:

```bash
py -m pip install -r requirements.txt
py app.py
```

Abre `http://127.0.0.1:5000`.

## 4. Configurar una cuenta y autenticación
1. En **Marketplaces**, comprueba que el marketplace esté registrado.
2. En **Cuentas**, crea una cuenta y usa como `base_url` solo el origen del servicio, por ejemplo `https://tu-tienda.myshopify.com` (sin la ruta del endpoint).
3. En **Autenticaciones**, elige la cuenta y guarda las credenciales en el formato JSON correspondiente:
   - Bearer/OAuth2: `{"access_token":"TOKEN"}`
   - API Key en header: `{"key":"X-Shopify-Access-Token","value":"TOKEN","in":"header"}`
   - API Key en query: `{"key":"api_key","value":"TOKEN","in":"query"}`
   - Basic: `{"username":"USUARIO","password":"CONTRASEÑA"}`
4. Los nombres de campo dependen de la API. Amazon SP-API requiere un flujo de autenticación y encabezados específicos; guardar un token genérico no implementa por sí solo el flujo completo de autorización/firma de Amazon.

## 5. Ejecutar una petición real
1. Abre **Endpoints**.
2. Pulsa **Ejecutar petición** en un endpoint.
3. Selecciona una cuenta del mismo marketplace.
4. Si necesitas reemplazar los parámetros o el body guardado, introduce un objeto JSON. Si los dejas vacíos, se usan los valores guardados en la BD.
5. Pulsa **Enviar petición real**. Las operaciones POST, PUT, PATCH y DELETE piden confirmación porque pueden modificar datos remotos.
6. Revisa el código HTTP, la respuesta y el ID del registro de historial.

Endpoint HTTP:
`POST /api/endpoints/<id>/ejecutar`

Ejemplo de cuerpo:
```json
{
  "cuenta_id": 1,
  "params": {"limit": 10},
  "body": {"product": {"title": "Producto de prueba"}}
}
```
Envía solo los campos que quieras sobrescribir; omite `params` o `body` para respetar los valores almacenados.

## 6. Qué significan los errores
- `401`: faltan credenciales o el token no es válido.
- `403`: la cuenta/token no tiene permisos para esa operación.
- `400`/`422`: la API rechazó los parámetros o el cuerpo.
- `404`: ruta, recurso o versión de API incorrectos.
- `429`: límite de solicitudes alcanzado.
- Error de conexión: revisa URL base, red, DNS y disponibilidad del servicio.

El sistema ejecuta peticiones HTTP genéricas. No puede garantizar que todos los endpoints funcionen sin credenciales reales, permisos, versiones de API vigentes y parámetros requeridos por cada marketplace. Algunas APIs, especialmente Amazon SP-API, requieren autenticación específica que deberá implementarse por separado para tener compatibilidad completa.

## 7. Seguridad
- No uses cuentas de producción para probar POST/PUT/PATCH/DELETE si no quieres cambiar datos reales.
- No compartas tokens, contraseñas, `.env` ni la clave `FERNET_KEY`.
- Las solicitudes tienen un timeout para evitar esperas indefinidas y no siguen redirecciones automáticamente.
- Ejecuta esta aplicación en un entorno controlado; antes de exponerla en Internet agrega autenticación/autorización de usuarios, protección CSRF y restricciones de red adecuadas.


## 4. Organización del frontend

El HTML, CSS y JavaScript están separados para que sea más sencillo mantener el proyecto:

```text
templates/
  base.html
  index.html
  marketplaces.html
  cuentas.html
  autenticaciones.html
  endpoints.html
  historial.html

static/
  CSS/
    base.css
    index.css
    marketplaces.css
    cuentas.css
    autenticaciones.css
    endpoints.css
    historial.css
  JS/
    marketplaces.js
    cuentas.js
    autenticaciones.js
    endpoints.js
    historial.js
  modulos.js
```

- `templates/`: estructura HTML y bloques de Jinja de Flask.
- `static/CSS/base.css`: estilos generales compartidos por todas las páginas.
- `static/CSS/<página>.css`: estilos particulares de cada pantalla.
- `static/JS/<página>.js`: eventos, llamadas a la API y comportamiento de cada pantalla.
- `static/modulos.js`: funciones compartidas del proyecto.

Los archivos `.env`, la carpeta `.git` y los archivos temporales de Python no se incluyen en el ZIP. Crea tu propio `.env` a partir de `.env.example` y agrega ahí tus datos locales; no compartas contraseñas ni tokens.
