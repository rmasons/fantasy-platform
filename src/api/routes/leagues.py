from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from api.deps import CurrentUser, get_conn, get_current_user
from core.schemas import LeagueOut
from core.sleeper.client import SleeperClient

router = APIRouter(prefix="/leagues", tags=["leagues"])


@router.get("/{league_id}", response_model=LeagueOut)
def get_league(
    league_id: str,
    conn: Connection = Depends(get_conn),
    user: CurrentUser = Depends(get_current_user),
) -> LeagueOut:
    """Finalized/ingested league, read from the DB (the historical path)."""
    with conn.cursor() as cur:
        cur.execute(
            "select league_id, season, name, status "
            "from sleeper.leagues where league_id = %s",
            (league_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "League not ingested yet")
    return LeagueOut(**row)


@router.get("/{league_id}/live", response_model=LeagueOut)
def get_league_live(
    league_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> LeagueOut:
    """Current league, read live from Sleeper (the 'current slice' path)."""
    with SleeperClient() as client:
        data = client.get_league(league_id)
    if not data:
        raise HTTPException(404, "League not found on Sleeper")
    return LeagueOut(
        league_id=str(data.get("league_id")),
        season=data.get("season"),
        name=data.get("name"),
        status=data.get("status"),
    )
