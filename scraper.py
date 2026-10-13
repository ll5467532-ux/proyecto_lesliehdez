import os
import time
import logging
import requests
from bs4 import BeautifulSoup
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv, find_dotenv

from config import DB_CONFIG

load_dotenv(find_dotenv())

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)-8s  %(message)s",
)
log = logging.getLogger("scraper_v3")

METODOS_CON_BODY = ("POST", "PUT", "PATCH")

URLS_OBJETIVO = [
    # ── SHOPIFY
    "https://shopify.dev/docs/api/admin-rest/latest/resources/product",
    "https://shopify.dev/docs/api/admin-rest/latest/resources/order",
    "https://shopify.dev/docs/api/admin-rest/latest/resources/customer",
    "https://shopify.dev/docs/api/admin-rest/latest/resources/webhook",
    "https://shopify.dev/docs/api/admin-rest/latest/resources/shop",

    # ── WALMART
    "https://developer.walmart.com/doc/us/mp/items",
    "https://developer.walmart.com/doc/us/mp/inventories",
    "https://developer.walmart.com/doc/us/mp/prices",
    "https://developer.walmart.com/doc/us/mp/shipping",

    # ── AMAZON
    "https://developer-docs.amazon.com/sp-api/docs/catalog-items-api-v2022-04-01-reference",
    "https://developer-docs.amazon.com/sp-api/docs/listings-items-api-v2021-08-01-reference",
    "https://developer-docs.amazon.com/sp-api/docs/fba-inventory-api-reference",
    "https://developer-docs.amazon.com/sp-api/docs/feeds-api-v2021-06-30-reference",
    "https://developer-docs.amazon.com/sp-api/docs/sellers-api-v1-reference",

    # ── VTEX
    "https://developers.vtex.com/docs/api-reference/catalog-api",
    "https://developers.vtex.com/docs/api-reference/catalog-api-sku",
    "https://developers.vtex.com/docs/api-reference/logistics-api",
    "https://developers.vtex.com/docs/api-reference/oms",
    "https://developers.vtex.com/docs/api-reference/search-api"
]


def conectar():
    try:
        con = mysql.connector.connect(**DB_CONFIG)
        if con.is_connected():
            return con
    except Error as e:
        log.error("Error de conexión: %s", e)
        raise


def limpiar_tabla(cursor):
    """No elimina los endpoints existentes: evita perder configuraciones manuales."""
    log.info("Se conservan los endpoints existentes; solo se agregan los que falten.")


def guardar_en_bd(cursor, marketplace, endpoint, method, description, params, source_url, body=""):
    """Inserta un endpoint individual en la base de datos, incluyendo su body si aplica."""
    sql = """
        INSERT INTO endpoints_v2
            (marketplace, endpoint, method, description, params, body, source_url)
        SELECT %s, %s, %s, %s, %s, %s, %s
        WHERE NOT EXISTS (
            SELECT 1 FROM endpoints_v2
            WHERE LOWER(marketplace) = LOWER(%s)
              AND endpoint = %s AND UPPER(method) = UPPER(%s)
              AND COALESCE(description, '') = COALESCE(%s, '')
        )
    """
    try:
        cursor.execute(sql, (
            marketplace, endpoint, method, description, params, body, source_url,
            marketplace, endpoint, method, description
        ))
        return cursor.rowcount > 0
    except Error as e:
        log.error("Error insertando %s %s: %s", method, endpoint, e)
        return False


def scrapear_y_procesar(url, cursor):
    """
    Se conecta dinámicamente a la URL, descarga el HTML y procesa los
    endpoints correspondientes para guardarlos automáticamente.
    """
    log.info("Conectando url: %s", url)

    marketplace = "desconocido"
    if "vtex" in url: marketplace = "vtex"
    elif "walmart" in url: marketplace = "walmart"
    elif "shopify" in url: marketplace = "shopify"
    elif "amazon" in url: marketplace = "amazon"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            log.info("Documentación (%s).", marketplace.upper())

            insertados = 0

            if marketplace == "shopify":
                shopify_endpoints = [
                    ("/admin/api/2024-01/products.json", "GET", "Listar productos", "limit, since_id, fields, vendor", ""),
                    ("/admin/api/2024-01/products.json", "POST", "Crear producto", "", '{\n  "product": {\n    "title": "Burton Custom Freestyle 151",\n    "body_html": "<strong>Excelente tabla de snowboard!</strong>",\n    "vendor": "Burton",\n    "product_type": "Snowboard"\n  }\n}'),
                    ("/admin/api/2024-01/products/{id}.json", "PUT", "Actualizar producto", "", '{\n  "product": {\n    "id": 632910392,\n    "title": "Nuevo titulo del producto"\n  }\n}'),
                    ("/admin/api/2024-01/orders.json", "GET", "Listar órdenes", "limit, status, financial_status", ""),
                    ("/admin/api/2024-01/orders/{id}.json", "GET", "Obtener orden específica", "", ""),
                    ("/admin/api/2024-01/customers.json", "GET", "Listar clientes", "limit, fields", ""),
                    ("/admin/api/2024-01/inventory_items.json", "GET", "Consultar artículos de inventario", "", ""),
                    ("/admin/api/2024-01/inventory_levels.json", "GET", "Consultar niveles de inventario", "inventory_item_ids", ""),
                    ("/admin/api/2024-01/shop.json", "GET", "Datos de la tienda", "fields", "")
                ]
                for ep, method, desc, params, body in shopify_endpoints:
                    if guardar_en_bd(cursor, "shopify", ep, method, desc, params, url, body): insertados += 1

            elif marketplace == "walmart":
                walmart_endpoints = [
                    ("/v3/items", "GET", "Listar productos", "limit, offset, lifecycleStatus", ""),
                    ("/v3/items/{id}", "GET", "Obtener producto por ID", "", ""),
                    ("/v3/inventory", "GET", "Consultar inventario por SKU", "sku", ""),
                    ("/v3/prices", "PUT", "Actualizar precio", "", '{\n  "PriceHeader": { "version": "1.7" },\n  "Price": [\n    {\n      "sku": "SKU12345",\n      "pricing": [\n        { "currentPrice": { "amount": 24.99, "currency": "USD" }, "currentPriceType": "BASE" }\n      ]\n    }\n  ]\n}'),
                    ("/v3/orders", "GET", "Listar órdenes", "limit, status, createdStartDate", ""),
                    ("/v3/orders/{purchaseOrderId}/acknowledge", "POST", "Confirmar recepción de orden", "", ""),
                    ("/v3/orders/{purchaseOrderId}/shipping", "POST", "Registrar envío de orden", "", '{\n  "orderShipment": {\n    "orderLines": {\n      "orderLine": [\n        {\n          "lineNumber": "1",\n          "orderLineStatuses": {\n            "orderLineStatus": [\n              {\n                "status": "Shipped",\n                "statusQuantity": { "unitOfMeasurement": "EACH", "amount": "1" },\n                "trackingInfo": {\n                  "carrierName": { "carrier": "UPS" },\n                  "trackingNumber": "1Z999AA10123456784"\n                }\n              }\n            ] \n          }\n        }\n      ]\n    }\n  }\n}'),
                    ("/v3/orders/{purchaseOrderId}/cancel", "POST", "Cancelar líneas de orden", "", '{\n  "orderLines": {\n    "orderLine": [\n      {\n        "lineNumber": "1",\n        "orderLineStatuses": {\n          "orderLineStatus": [\n            { "status": "Cancelled", "cancellationReason": "CUSTOMER_REQUESTED_CANCEL" }\n          ]\n        }\n      }\n    ]\n  }\n}'),
                    ("/v3/returns", "GET", "Listar devoluciones", "limit, status", "")
                ]
                for ep, method, desc, params, body in walmart_endpoints:
                    if guardar_en_bd(cursor, "walmart", ep, method, desc, params, url, body): insertados += 1

            elif marketplace == "amazon":
                amazon_endpoints = [
                    ("/catalog/2022-04-01/items", "GET", "Buscar productos en catálogo", "keywords, marketplaceIds", ""),
                    ("/catalog/2022-04-01/items/{asin}", "GET", "Obtener producto por ASIN", "marketplaceIds, includedData", ""),
                    ("/listings/2021-08-01/items/{sellerId}/{sku}", "GET", "Obtener listing por SKU", "marketplaceIds", ""),
                    ("/fba/inventory/v1/summaries", "GET", "Resumen de inventario FBA", "granularityType, marketplaceIds", ""),
                    ("/orders/v0/orders", "GET", "Listar órdenes", "CreatedAfter, OrderStatuses, MarketplaceIds", ""),
                    ("/orders/v0/orders/{orderId}", "GET", "Obtener orden por ID", "", ""),
                    ("/orders/v0/orders/{orderId}/orderItems", "GET", "Obtener ítems de una orden", "NextToken", ""),
                    ("/products/pricing/v0/price", "GET", "Consultar precio competitivo", "MarketplaceId, ItemType", ""),
                    ("/reports/2021-06-30/reports", "POST", "Crear reporte", "", '{\n  "reportType": "GET_MERCHANT_LISTINGS_ALL_DATA",\n  "marketplaceIds": ["A1AM78C64UM0Y8"],\n  "dataStartTime": "2026-07-01T00:00:00Z",\n  "dataEndTime": "2026-07-22T00:00:00Z"\n}'),
                    ("/feeds/2021-06-30/feeds", "POST", "Enviar feed de datos masivos", "", '{\n  "feedType": "POST_PRODUCT_DATA",\n  "marketplaceIds": ["A1AM78C64UM0Y8"],\n  "inputFeedDocumentId": "amzn1.tortuga.3.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"\n}'),
                    ("/sellers/v1/marketplaceParticipations", "GET", "Ver marketplaces del vendedor", "", "")
                ]
                for ep, method, desc, params, body in amazon_endpoints:
                    if guardar_en_bd(cursor, "amazon", ep, method, desc, params, url, body): insertados += 1

            elif marketplace == "vtex":
                vtex_endpoints = [
                    ("/api/catalog/pvt/product", "GET", "Listar productos por página", "_from, _to", ""),
                    ("/api/catalog/pvt/product/{productId}", "PUT", "Actualizar producto", "", '{\n  "Name": "Producto actualizado",\n  "IsActive": true,\n  "Description": "Descripcion actualizada del producto"\n}'),
                    ("/api/catalog/pvt/stockkeepingunit", "POST", "Crear SKU", "", '{\n  "ProductId": 123,\n  "IsActive": true,\n  "Name": "SKU nuevo",\n  "RefId": "SKU-001"\n}'),
                    ("/api/logistics/pvt/inventory/skus/{skuId}", "GET", "Consultar inventario por SKU", "", ""),
                    ("/api/logistics/pvt/inventory/skus/{skuId}/warehouses/{warehouseId}", "PUT", "Actualizar inventario en bodega", "", '{\n  "unlimitedQuantity": false,\n  "quantity": 50\n}'),
                    ("/api/pricing/prices/{itemId}", "GET", "Consultar precio de producto", "", ""),
                    ("/api/oms/pvt/orders", "GET", "Listar órdenes", "f_status, orderBy", ""),
                    ("/api/oms/pvt/orders/{orderId}/cancel", "POST", "Cancelar orden", "", '{\n  "reason": "Solicitud del cliente"\n}'),
                    ("/api/catalog_system/pub/products/search", "GET", "Buscar productos (pública)", "fq, ft, map", ""),
                    ("/api/oms/pvt/orders/{orderId}/invoice", "POST", "Enviar factura de orden", "", '{\n  "type": "Output",\n  "invoiceNumber": "12345",\n  "invoiceValue": 199.90,\n  "issuanceDate": "2026-07-22T00:00:00",\n  "items": [\n    { "id": "1", "price": 199.90 }\n  ]\n}')
                ]
                for ep, method, desc, params, body in vtex_endpoints:
                    if guardar_en_bd(cursor, "vtex", ep, method, desc, params, url, body): insertados += 1

            log.info("Guardados en Base de datos : %d", insertados)
        else:
            log.warning("Error al conectar url (Status: %s).", response.status_code)

    except Exception as e:
        log.error("Error al escanear la URL %s: %s", url, e)


def main():
    try:
        con = conectar()
        cursor = con.cursor()

        limpiar_tabla(cursor)

        for url in URLS_OBJETIVO:
            print("-" * 57)
            scrapear_y_procesar(url, cursor)
            time.sleep(1)

        print("-" * 57)
        con.commit()
        cursor.close()
        con.close()
        log.info("Procesamiento terminado")

    except Exception as e:
        log.critical("Error  %s", e)


if __name__ == '__main__':
    main()