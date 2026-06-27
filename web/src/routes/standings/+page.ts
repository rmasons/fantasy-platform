import { getStandings } from '$lib/api';

const SAMPLE_LEAGUE_ID = '12345';

export async function load() {
	const { season, rows } = await getStandings(SAMPLE_LEAGUE_ID);
	return { season, rows };
}
