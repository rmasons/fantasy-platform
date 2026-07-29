"""Application entry point — where everything gets wired together.

Build spec: `docs/build/01-foundation.md` section 6.

Four responsibilities, and nothing else:

1. **Lifespan** — open the connection pool at startup, close it at shutdown.
2. **CORS middleware** — fed from the parsed origins on `Settings`.
3. **Router registration** — mount the health router.
4. **The `app` object** that `uvicorn api.main:app` imports.

The load-bearing requirement is that **startup must not require the database**.
`min_size=0` means opening the pool connects to nothing, so the app starts with
Postgres stopped and `/health` reports the truth instead of the process
crash-looping. Verify that rather than assuming it — it is criterion 1, and it
is the one people fail by taking for granted that a pool must connect eagerly.

Run it: ``PYTHONPATH=src uvicorn api.main:app --reload``
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hook. Everything before the `yield` runs at startup,
    everything after it runs at shutdown.

    This one may be `async def` — it runs once, not per request, and neither
    `open_pool()` nor `close_pool()` does I/O worth worrying about at startup.

    TODO(spec 01 section 6):
      - before the yield: ``open_pool()`` from `core.db.pool`
      - after the yield:  ``close_pool()``
    """
    yield


def create_app() -> FastAPI:
    """Build and configure the application.

    A factory rather than a bare module-level `FastAPI()` so tests can build a
    fresh, independently-configured app instead of mutating a global one.

    TODO(spec 01 section 6):
      1. ``FastAPI(lifespan=lifespan, title=..., version=...)``
      2. ``app.add_middleware(CORSMiddleware, allow_origins=..., ...)`` —
         imported from `fastapi.middleware.cors`, with the origin list coming
         from `get_settings().origins` (see `core/config.py`). Decide
         deliberately what you allow beyond origins: methods, headers,
         credentials. `allow_credentials=True` cannot be combined with
         ``allow_origins=["*"]``, which is one reason the origins list is
         explicit.
      3. ``app.include_router(health.router)`` — from `api.routes.health`.
      4. Return the app.

    Closes criteria 1, 5, and 8.
    """
    raise NotImplementedError


# TODO(spec 01 section 6): uncomment once `create_app()` is implemented. This
# name is what `uvicorn api.main:app` imports — the module path and the
# attribute both matter.
# app = create_app()
