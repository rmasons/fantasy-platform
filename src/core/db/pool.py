from collections.abc import Iterator
from contextlib import contextmanager
import psycopg
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool
from core.config import get_settings

_pool: ConnectionPool | None = None

def get_pool() -> ConnectionPool:
    """Return the shared pool, creating it on first call.

    Creating the pool does not connect to anything: `min_size=0` means it starts
    empty and `open=False` leaves the background workers stopped until
    `open_pool()` runs. Safe to call before Postgres is reachable.
    """
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=0,
            max_size=10,
            timeout=5.0,
            open=False,
            kwargs={"row_factory": dict_row},
        )
    return _pool

def open_pool() -> None:
    """Start the pool. Called from the lifespan hook at startup."""
    get_pool().open()


def close_pool() -> None:
    """Close the pool and forget it. Called from the lifespan hook at shutdown."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None

@contextmanager
def connection() -> Iterator[psycopg.Connection[DictRow]]:
    """Borrow a connection from the pool, returning it on exit.

    Raises `psycopg_pool.PoolTimeout` if none becomes available within the
    pool's timeout — which is what keeps /health fast when Postgres is down.
    """
    with get_pool().connection() as conn:
        yield conn