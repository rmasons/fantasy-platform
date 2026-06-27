import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import StandingsTable from './StandingsTable.svelte';
import { mapStandings } from '$lib/standings';
import { standingsFixture } from '$lib/fixtures/standings';

const { rows } = mapStandings(standingsFixture);

describe('StandingsTable', () => {
	it('renders a team name from the fixture', () => {
		const { getAllByText } = render(StandingsTable, { props: { rows } });
		// Team name appears in both desktop table and mobile card
		const matches = getAllByText('Gridiron Gurus');
		expect(matches.length).toBeGreaterThan(0);
	});

	it('renders the PF value formatted to 2 decimal places', () => {
		const { getAllByText } = render(StandingsTable, { props: { rows } });
		// First team in fixture has fpts: 1623.42 — appears in desktop table
		const matches = getAllByText('1623.42');
		expect(matches.length).toBeGreaterThan(0);
	});

	it('renders all team names', () => {
		const { getAllByText } = render(StandingsTable, { props: { rows } });
		expect(getAllByText('Blitz Kreig').length).toBeGreaterThan(0);
		expect(getAllByText('Sunday Funday').length).toBeGreaterThan(0);
		expect(getAllByText('The Bye Week Blues').length).toBeGreaterThan(0);
	});

	it('renders empty state when rows is empty', () => {
		const { getByText } = render(StandingsTable, { props: { rows: [] } });
		expect(getByText(/No standings available yet/)).toBeInTheDocument();
	});
});
