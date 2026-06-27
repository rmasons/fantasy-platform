import { mapStandings } from './standings';
import { standingsFixture } from './fixtures/standings';
import type { StandingRow } from './standings';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export async function getStandings(
	leagueId: string
): Promise<{ season: string; rows: StandingRow[] }> {
	if (!API_BASE) {
		// Dev / no backend configured — return fixture data
		return mapStandings(standingsFixture);
	}

	const res = await fetch(`${API_BASE}/leagues/${leagueId}/standings`);
	if (!res.ok) {
		throw new Error(`Failed to fetch standings: HTTP ${res.status}`);
	}
	const data = await res.json();
	return mapStandings(data);
}
