-- Neurotry: esquema compatible con app.py.
-- No elimina tablas ni registros existentes.
CREATE DATABASE IF NOT EXISTS marketplaces CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE marketplaces;

-- Tabla heredada: se conserva para migrar proyectos que usaban `endpoints`.
CREATE TABLE IF NOT EXISTS endpoints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    marketplace VARCHAR(100) NOT NULL,
    endpoint VARCHAR(1000) NOT NULL,
    method VARCHAR(10) NOT NULL,
    description VARCHAR(500),
    params LONGTEXT NULL,
    body LONGTEXT NULL,
    source_url VARCHAR(1000),
    INDEX idx_endpoints_marketplace (marketplace),
    INDEX idx_endpoints_method (method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS endpoints_v2 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    marketplace VARCHAR(100) NOT NULL,
    endpoint VARCHAR(1000) NOT NULL,
    method VARCHAR(10) NOT NULL,
    description VARCHAR(500) NULL,
    params LONGTEXT NULL,
    body LONGTEXT NULL,
    source_url VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_endpoints_v2_marketplace (marketplace),
    INDEX idx_endpoints_v2_method (method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketplaces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    docs_url VARCHAR(1000) NULL,
    auth_tipo VARCHAR(20) NOT NULL DEFAULT 'otro',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_marketplaces_nombre (nombre),
    UNIQUE KEY uq_marketplaces_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuentas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    marketplace_id INT NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    base_url VARCHAR(1000) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cuentas_marketplace (marketplace_id),
    CONSTRAINT fk_cuentas_marketplace FOREIGN KEY (marketplace_id)
        REFERENCES marketplaces(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS autenticaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cuenta_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    credenciales_cifradas TEXT NOT NULL,
    expira_en DATETIME NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_cuenta_activo (cuenta_id, activo),
    CONSTRAINT fk_auth_cuenta FOREIGN KEY (cuenta_id)
        REFERENCES cuentas(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS historial (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cuenta_id INT NOT NULL,
    endpoint_id INT NOT NULL,
    status_code SMALLINT NULL,
    duracion_ms INT NOT NULL DEFAULT 0,
    ejecutado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_body LONGTEXT NULL,
    headers LONGTEXT NULL,
    respuesta LONGTEXT NULL,
    INDEX idx_historial_fecha (ejecutado_en),
    INDEX idx_historial_cuenta (cuenta_id),
    INDEX idx_historial_endpoint (endpoint_id),
    CONSTRAINT fk_historial_cuenta FOREIGN KEY (cuenta_id)
        REFERENCES cuentas(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_historial_endpoint FOREIGN KEY (endpoint_id)
        REFERENCES endpoints_v2(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migra registros heredados sin duplicar la misma combinación endpoint/método/marketplace.
INSERT INTO endpoints_v2 (marketplace, endpoint, method, description, params, body, source_url)
SELECT e.marketplace, e.endpoint, UPPER(e.method), e.description, e.params, e.body, e.source_url
FROM endpoints e
WHERE NOT EXISTS (
    SELECT 1 FROM endpoints_v2 v
    WHERE v.marketplace = e.marketplace
      AND v.endpoint = e.endpoint
      AND UPPER(v.method) = UPPER(e.method)
      AND COALESCE(v.description, '') = COALESCE(e.description, '')
);

-- Registra marketplaces encontrados en endpoints y que aún no existen en el catálogo.
INSERT IGNORE INTO marketplaces (nombre, slug, auth_tipo)
SELECT DISTINCT v.marketplace,
       LOWER(TRIM(BOTH '-' FROM REGEXP_REPLACE(v.marketplace, '[^a-zA-Z0-9]+', '-'))),
       'otro'
FROM endpoints_v2 v
WHERE v.marketplace IS NOT NULL AND TRIM(v.marketplace) <> '';
