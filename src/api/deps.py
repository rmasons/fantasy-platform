"""FastAPI dependencies: a pooled DB connection and the current user.

Auth model: the web frontend forwards the user's Firebase ID token as a Bearer
header; this API verifies it. In local dev with no Firebase configured, a bypass
user is returned so the API is runnable without credentials.
"""

from collections.abc import Iterator

from fastapi import Depends, Header, HTTPException, status
from psycopg import Connection

from core.config import Settings, get_settings
from core.db.pool import connection


def get_conn() -> Iterator[Connection]:
    with connection() as conn:
        yield conn


class CurrentUser:
    def __init__(self, uid: str, email: str | None = None) -> None:
        self.uid = uid
        self.email = email


def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if settings.firebase_project_id is None and settings.is_local:
        return CurrentUser(uid="local-dev", email="dev@localhost")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1]
    try:
        from firebase_admin import auth as fb_auth  # lazy: only needed in prod

        decoded = fb_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))
