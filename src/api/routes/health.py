"""Liveness and readiness routes.

Build spec: `docs/build/01-foundation.md` section 5.

Two endpoints, deliberately separate:

- `/ping` is **liveness** — it touches nothing and must answer when everything
  else is broken. No dependency, no database.
- `/health` is **readiness** — it borrows a connection and reports whether the
  database is reachable.

Both are plain `def`, not `async def`: the psycopg pool blocks, and FastAPI runs
sync handlers in a threadpool where that is harmless.
"""

from fastapi import APIRouter

from api.deps import DbConn
from core.schemas import Health

router = APIRouter(tags=["health"])


@router.get("/ping")
def ping() -> dict[str, str]:
    """Liveness probe. Touches nothing.

    TODO(spec 01 section 5): return a literal — e.g. ``{"status": "ok"}``.
    Its emptiness is the specification: an uptime check hits this, so it must
    not acquire a connection, read settings, or do anything that can fail.
    """
    raise NotImplementedError


@router.get("/health")
def health(db: DbConn) -> Health:
    """Readiness probe: is the database reachable?

    The `-> Health` annotation is what FastAPI turns into the OpenAPI response
    schema, which in turn generates the Swift and TypeScript clients. That
    annotation is the contract — not a comment about it.

    TODO(spec 01 section 5):
      1. Run ``SELECT 1`` on `db` and report ``db="ok"``.
      2. Catch the connection failure and report ``db="unavailable"`` **with a
         200**, not a 500. A degraded dependency is not a failed request: the
         API answered correctly, and the answer is "the database is away."
         Returning 500 here makes an uptime checker restart a healthy process.
      3. `env` comes from `app_env` on the settings object.

    The failure mode to watch is a *slow* database rather than a stopped one —
    it hangs instead of erroring and reads as a total outage. The bounded
    `timeout=5.0` in `core/db/pool.py` is what prevents that; this route is
    where you find out whether it actually works. Closes criteria 2, 3, and 4.
    """
    raise NotImplementedError
