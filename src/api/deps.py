"""FastAPI dependencies shared across routers."""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import Depends
from psycopg.rows import DictRow

from core.db.pool import connection


def get_db() -> Iterator[psycopg.Connection[DictRow]]:
    """Yield a pooled connection for the duration of one request.

    A plain `def`, not `async def`: the psycopg pool blocks, and FastAPI runs
    sync dependencies in a threadpool where blocking is harmless. An `async def`
    here would block the event loop and stall every other in-flight request.

    The `with` block is what guarantees the connection goes back to the pool —
    FastAPI runs the code after `yield` once the response is sent, whether or
    not the route raised.
    """
    with connection() as conn:
        yield conn


DbConn = Annotated[psycopg.Connection[DictRow], Depends(get_db)]
"""Route parameter type: `def route(db: DbConn) -> ...`."""
