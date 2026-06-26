"""Scheduled ingestion jobs. Runs as a separate process from the API (a Railway
cron service), but shares ``core`` — same DB pool, same Sleeper client."""
