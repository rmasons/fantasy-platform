"""Thin Sleeper API client. Read-only, public endpoints, no auth.

Scaffold covers the two endpoints the rest of the skeleton uses; the full set
(rosters, matchups, transactions, drafts, players) gets added alongside the
ingestion jobs.
"""

import httpx

from core.config import get_settings


class SleeperClient:
    def __init__(self, base_url: str | None = None, timeout: float = 10.0) -> None:
        base = (base_url or get_settings().sleeper_base_url).rstrip("/")
        self._client = httpx.Client(base_url=base, timeout=timeout)

    def get_state(self, sport: str = "nfl") -> dict:
        resp = self._client.get(f"/state/{sport}")
        resp.raise_for_status()
        return resp.json()

    def get_league(self, league_id: str) -> dict | None:
        resp = self._client.get(f"/league/{league_id}")
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SleeperClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
