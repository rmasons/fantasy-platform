//#region src/lib/standings.ts
function mapStandings(api) {
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
//#endregion
//#region src/lib/fixtures/standings.ts
/**
* Realistic API response fixture — used in dev (when VITE_API_BASE_URL is unset) and tests.
*/
var standingsFixture = {
	league_id: "12345",
	season: "2024",
	standings: [
		{
			rank: 1,
			roster_id: 3,
			team_name: "Gridiron Gurus",
			owner_name: "mason",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
			wins: 10,
			losses: 3,
			ties: 0,
			fpts: 1623.42,
			fpts_against: 1450.1
		},
		{
			rank: 2,
			roster_id: 7,
			team_name: "Blitz Kreig",
			owner_name: "alex",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
			wins: 9,
			losses: 4,
			ties: 0,
			fpts: 1589.76,
			fpts_against: 1421.33
		},
		{
			rank: 3,
			roster_id: 1,
			team_name: "Sunday Funday",
			owner_name: "sarah",
			avatar: null,
			wins: 8,
			losses: 5,
			ties: 0,
			fpts: 1512.88,
			fpts_against: 1499.02
		},
		{
			rank: 4,
			roster_id: 5,
			team_name: "The Benchwarmer",
			owner_name: "chris",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
			wins: 7,
			losses: 6,
			ties: 0,
			fpts: 1478.55,
			fpts_against: 1502.21
		},
		{
			rank: 5,
			roster_id: 9,
			team_name: "Hail Mary",
			owner_name: "Hail Mary",
			avatar: null,
			wins: 7,
			losses: 6,
			ties: 0,
			fpts: 1455.3,
			fpts_against: 1388.77
		},
		{
			rank: 6,
			roster_id: 2,
			team_name: "Touchdown Kings",
			owner_name: "jordan",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
			wins: 6,
			losses: 7,
			ties: 0,
			fpts: 1411.9,
			fpts_against: 1530.45
		},
		{
			rank: 7,
			roster_id: 11,
			team_name: "Red Zone Rockets",
			owner_name: "taylor",
			avatar: null,
			wins: 5,
			losses: 8,
			ties: 0,
			fpts: 1388.12,
			fpts_against: 1444.67
		},
		{
			rank: 8,
			roster_id: 4,
			team_name: "The Waiver Wire Warriors",
			owner_name: "morgan",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
			wins: 4,
			losses: 9,
			ties: 0,
			fpts: 1344.05,
			fpts_against: 1555.88
		},
		{
			rank: 9,
			roster_id: 8,
			team_name: "Injured Reserve",
			owner_name: "riley",
			avatar: "https://sleepercdn.com/avatars/thumbs/v2/f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
			wins: 3,
			losses: 10,
			ties: 0,
			fpts: 1299.44,
			fpts_against: 1601.23
		},
		{
			rank: 10,
			roster_id: 6,
			team_name: "The Bye Week Blues",
			owner_name: "drew",
			avatar: null,
			wins: 2,
			losses: 11,
			ties: 0,
			fpts: 1198.77,
			fpts_against: 1644.9
		}
	]
};
//#endregion
//#region src/lib/api.ts
async function getStandings(leagueId) {
	return mapStandings(standingsFixture);
}
//#endregion
//#region src/routes/standings/+page.ts
var SAMPLE_LEAGUE_ID = "12345";
async function load() {
	const { season, rows } = await getStandings(SAMPLE_LEAGUE_ID);
	return {
		season,
		rows
	};
}
//#endregion
export { load };
