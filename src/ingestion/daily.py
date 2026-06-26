"""Daily ingest. The cron's real job is "finalize" newly-immutable weeks; this
scaffold refreshes ``nfl_state`` to prove the Sleeper→DB write path end to end.
Matchup/transaction finalize (per the concatenation pattern) lands here next.
"""

from core.db.pool import connection
from core.sleeper.client import SleeperClient


def run() -> None:
    with SleeperClient() as client:
        state = client.get_state("nfl")

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into sleeper.nfl_state (id, season, week, season_type, synced_at)
                values (true, %s, %s, %s, now())
                on conflict (id) do update set
                    season      = excluded.season,
                    week        = excluded.week,
                    season_type = excluded.season_type,
                    synced_at   = excluded.synced_at
                """,
                (state.get("season"), state.get("week"), state.get("season_type")),
            )
        conn.commit()

    print(
        f"daily: nfl_state season={state.get('season')} "
        f"week={state.get('week')} type={state.get('season_type')}"
    )
