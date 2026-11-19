from dotenv import load_dotenv
import mysql.connector
from mysql.connector import pooling
import os
import time
from pathlib import Path
from threading import Lock

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

POOL_SIZE = 2
POOL_WAIT_SECONDS = 5

_pool = None
_pool_lock = Lock()


def _connection_config():
    return dict(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


def get_database_connection():
    return mysql.connector.connect(**_connection_config())


def _get_pool():
    # Created lazily so each process that imports this module builds its own.
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="firebomba_pool",
                    pool_size=POOL_SIZE,
                    pool_reset_session=True,
                    **_connection_config(),
                )
    return _pool


def get_pooled_connection():
    """Borrow a connection from the pool; .close() hands it back.

    mysql-connector raises PoolError immediately when every connection is in
    use, so wait briefly for one to be returned instead of failing.
    """
    deadline = time.monotonic() + POOL_WAIT_SECONDS
    while True:
        try:
            return _get_pool().get_connection()
        except pooling.errors.PoolError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.05)
