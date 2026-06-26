import os

os.environ.setdefault("APP_ENV", "local")

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

client = TestClient(app)


def test_ping_no_db():
    resp = client.get("/ping")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_reports_db_unavailable_without_db():
    # No DB running in unit tests — health should degrade, not crash.
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] in {"ok", "unavailable"}
