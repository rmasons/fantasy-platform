import { describe, it, expect } from 'vitest';
import { mapStandings } from './standings';

const makeApiRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
	rank: 1,
	roster_id: 1,
	team_name: 'Team Alpha',
	owner_name: 'alice',
	avatar: 'https://example.com/avatar.png',
	wins: 8,
	losses: 5,
	ties: 0,
	fpts: 1234.56,
	fpts_against: 1100.00,
	...overrides
});

const makeApiResponse = (rows: ReturnType<typeof makeApiRow>[]) => ({
	league_id: '12345',
	season: '2024',
	standings: rows
});

describe('mapStandings', () => {
	it('maps snake_case fields to camelCase', () => {
		const api = makeApiResponse([makeApiRow()]);
		const result = mapStandings(api);

		expect(result.season).toBe('2024');
		expect(result.rows).toHaveLength(1);

		const row = result.rows[0];
		expect(row.rank).toBe(1);
		expect(row.rosterId).toBe(1);
		expect(row.teamName).toBe('Team Alpha');
		expect(row.ownerName).toBe('alice');
		expect(row.avatar).toBe('https://example.com/avatar.png');
		expect(row.wins).toBe(8);
		expect(row.losses).toBe(5);
		expect(row.ties).toBe(0);
		expect(row.fpts).toBe(1234.56);
		expect(row.fptsAgainst).toBe(1100.00);
	});

	it('maps null avatar to null', () => {
		const api = makeApiResponse([makeApiRow({ avatar: null })]);
		const result = mapStandings(api);
		expect(result.rows[0].avatar).toBeNull();
	});

	it('preserves ordering of rows', () => {
		const rows = [
			makeApiRow({ rank: 1, team_name: 'First' }),
			makeApiRow({ rank: 2, team_name: 'Second' }),
			makeApiRow({ rank: 3, team_name: 'Third' }),
		];
		const result = mapStandings(makeApiResponse(rows));
		expect(result.rows.map(r => r.rank)).toEqual([1, 2, 3]);
		expect(result.rows.map(r => r.teamName)).toEqual(['First', 'Second', 'Third']);
	});

	it('handles an empty standings list', () => {
		const result = mapStandings(makeApiResponse([]));
		expect(result.rows).toEqual([]);
		expect(result.season).toBe('2024');
	});

	it('does not include a streak field', () => {
		const api = makeApiResponse([makeApiRow()]);
		const result = mapStandings(api);
		expect(result.rows[0]).not.toHaveProperty('streak');
	});
});
