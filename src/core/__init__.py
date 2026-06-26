"""Shared library used by both the API and the ingestion jobs.

Keeping DB access, the Sleeper client, and (later) the business logic here means
the always-on API and the scheduled ingestion run the same, tested code.
"""
