const BASE_URL = "https://api.sleeper.app/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Sleeper API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export type SleeperLeague = {
  league_id: string;
  season: string;
  name: string;
  status: string;
  previous_league_id?: string;
  settings: Record<string, unknown>;
};

export type SleeperUser = {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
  avatar?: string;
};

export type SleeperRoster = {
  roster_id: number;
  owner_id: string;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
  };
};

export const sleeper = {
  getLeague: (id: string) => get<SleeperLeague>(`/league/${id}`),
  getLeagueUsers: (id: string) => get<SleeperUser[]>(`/league/${id}/users`),
  getLeagueRosters: (id: string) => get<SleeperRoster[]>(`/league/${id}/rosters`),
};
