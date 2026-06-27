export interface StandingRow {
	rank: number;
	rosterId: number;
	teamName: string;
	ownerName: string;
	avatar: string | null;
	wins: number;
	losses: number;
	ties: number;
	fpts: number;
	fptsAgainst: number;
}

interface ApiStandingRow {
	rank: number;
	roster_id: number;
	team_name: string;
	owner_name: string;
	avatar: string | null;
	wins: number;
	losses: number;
	ties: number;
	fpts: number;
	fpts_against: number;
}

interface ApiStandingsResponse {
	league_id: string;
	season: string;
	standings: ApiStandingRow[];
}

export function mapStandings(api: ApiStandingsResponse): { season: string; rows: StandingRow[] } {
	return {
		season: api.season,
		rows: api.standings.map((row) => ({
			rank: row.rank,
			rosterId: row.roster_id,
			teamName: row.team_name,
			ownerName: row.owner_name,
			avatar: row.avatar ?? null,
			wins: row.wins,
			losses: row.losses,
			ties: row.ties,
			fpts: row.fpts,
			fptsAgainst: row.fpts_against
		}))
	};
}
