"""Backfill a league chain into ``sleeper.*``. Scaffold upserts the single league
row; the full walk (previous_league_id → rosters/matchups/transactions/drafts per
season, all idempotent) lands here next.
"""

from psycopg.types.json import Json

from core.db.pool import connection
from core.sleeper.client import SleeperClient


def run(league_id: str) -> None:
    with SleeperClient() as client:
        league = client.get_league(league_id)

    if not league:
        print(f"backfill: league {league_id} not found on Sleeper")
        return

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into sleeper.leagues
                    (league_id, season, name, status, previous_league_id, settings)
                values (%s, %s, %s, %s, %s, %s)
                on conflict (league_id) do update set
                    season             = excluded.season,
                    name               = excluded.name,
                    status             = excluded.status,
                    previous_league_id = excluded.previous_league_id,
                    settings           = excluded.settings
                """,
                (
                    str(league.get("league_id")),
                    league.get("season"),
                    league.get("name"),
                    league.get("status"),
                    league.get("previous_league_id"),
                    Json(league.get("settings") or {}),
                ),
            )
        conn.commit()

    print(f"backfill: upserted league {league_id} ({league.get('name')})")
