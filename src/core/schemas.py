"""Pydantic models shared across the API (response shapes) and ingestion."""

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    env: str
    db: str


class LeagueOut(BaseModel):
    league_id: str
    season: str | None = None
    name: str | None = None
    status: str | None = None
