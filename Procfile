# Railway/Nixpacks process definitions.
# web    — the always-on FastAPI service (the only DB client).
# Ingestion runs as a separate Railway *cron* service, command:
#   PYTHONPATH=src python -m ingestion daily
web: PYTHONPATH=src uvicorn api.main:app --host 0.0.0.0 --port $PORT
