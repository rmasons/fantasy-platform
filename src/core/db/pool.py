"""A single shared psycopg connection pool.

The pool matters because the API is always-on: connections are reused across
requests instead of opened per-request (the serverless pain point we designed
away). `min_size=0` means the app still starts when the DB is down — health just
reports it — instead of crash-looping.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from core.config import get_settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=0,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


@contextmanager
def connection() -> Iterator[Connection]:
    """Borrow a pooled connection. Rows come back as dicts."""
    with get_pool().connection() as conn:
        yield conn


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
