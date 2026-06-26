from fastapi import APIRouter, Depends

from core.config import Settings, get_settings
from core.db.pool import connection
from core.schemas import Health

router = APIRouter(tags=["health"])


@router.get("/ping")
def ping() -> dict:
    """Liveness — no DB. Safe for uptime checks and tests."""
    return {"status": "ok"}


@router.get("/health", response_model=Health)
def health(settings: Settings = Depends(get_settings)) -> Health:
    """Readiness — pings the DB; reports degraded instead of failing hard."""
    db_status = "ok"
    try:
        with connection() as conn, conn.cursor() as cur:
            cur.execute("select 1")
            cur.fetchone()
    except Exception:  # noqa: BLE001
        db_status = "unavailable"
    return Health(status="ok", env=settings.app_env, db=db_status)
