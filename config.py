"""Configuración de conexión. Los valores se leen del entorno o del archivo .env."""
import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "marketplaces"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "connection_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "10")),
}
