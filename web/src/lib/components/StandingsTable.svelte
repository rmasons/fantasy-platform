<script lang="ts">
	import type { StandingRow } from '$lib/standings';

	let { rows }: { rows: StandingRow[] } = $props();

	function rankStyle(rank: number): string {
		if (rank === 1) return 'text-amber-400 font-bold';
		if (rank === 2) return 'text-slate-300 font-semibold';
		if (rank === 3) return 'text-orange-600 font-semibold';
		return 'text-slate-600';
	}

	function rowStyle(rank: number): string {
		if (rank === 1) return 'bg-amber-500/[0.07] border-l-2 border-amber-400/60';
		return '';
	}

	const hasTies = $derived(rows.some((r) => r.ties > 0));
	const seasonStarted = $derived(rows.some((r) => r.wins > 0 || r.losses > 0 || r.ties > 0));
</script>

{#if rows.length === 0}
	<p class="text-navy-500">No standings available yet — season may not have started.</p>
{:else}
	{#if !seasonStarted}
		<div class="mb-4 rounded-lg border border-navy-700 bg-navy-850 px-4 py-3 text-sm text-navy-500">
			Season hasn't started — standings will populate after Week 1.
		</div>
	{/if}

	<!-- Desktop table -->
	<div class="hidden sm:block overflow-x-auto rounded-lg border border-navy-700">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-navy-900 text-navy-500 text-[10px] uppercase tracking-wider border-b border-navy-700">
					<th scope="col" class="px-4 py-3 text-left w-8">#</th>
					<th scope="col" class="px-4 py-3 text-left">Team</th>
					<th scope="col" class="px-4 py-3 text-center">W</th>
					<th scope="col" class="px-4 py-3 text-center">L</th>
					{#if hasTies}
						<th scope="col" class="px-4 py-3 text-center">T</th>
					{/if}
					<th scope="col" class="px-4 py-3 text-right">PF</th>
					<th scope="col" class="px-4 py-3 text-right">PA</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					<tr
						class="border-t border-navy-700/50 hover:bg-navy-800 transition-colors {rowStyle(row.rank)} {i % 2 !== 0 ? 'bg-navy-875' : ''}"
					>
						<td class="px-4 py-3">
							<span class="font-mono text-xs {rankStyle(row.rank)}">{row.rank}</span>
						</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-3">
								{#if row.avatar}
									<img
										src={row.avatar}
										alt=""
										class="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10"
									/>
								{:else}
									<div
										class="w-9 h-9 rounded-full bg-navy-800 flex items-center justify-center shrink-0 text-base"
									>
										🏈
									</div>
								{/if}
								<div>
									<p class="font-semibold text-white leading-tight">{row.teamName}</p>
									{#if row.ownerName && row.ownerName !== row.teamName}
										<p class="text-xs text-navy-500">{row.ownerName}</p>
									{/if}
								</div>
							</div>
						</td>
						<td class="px-4 py-3 text-center font-mono font-bold text-white tabular-nums"
							>{row.wins}</td
						>
						<td class="px-4 py-3 text-center font-mono text-slate-500 tabular-nums"
							>{row.losses}</td
						>
						{#if hasTies}
							<td class="px-4 py-3 text-center font-mono text-navy-500 tabular-nums"
								>{row.ties}</td
							>
						{/if}
						<td
							class="px-4 py-3 text-right font-mono tabular-nums {row.rank === 1
								? 'text-amber-400 font-semibold'
								: 'text-slate-200'}">{row.fpts.toFixed(2)}</td
						>
						<td class="px-4 py-3 text-right font-mono text-navy-500 tabular-nums"
							>{row.fptsAgainst.toFixed(2)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Mobile cards -->
	<div class="sm:hidden space-y-2">
		{#each rows as row}
			<div
				class="bg-navy-850 rounded-lg border border-navy-700 px-4 py-3 flex items-center gap-3 {rowStyle(row.rank)}"
			>
				<span class="font-mono text-xs w-5 text-center shrink-0 {rankStyle(row.rank)}"
					>{row.rank}</span
				>
				{#if row.avatar}
					<img
						src={row.avatar}
						alt=""
						class="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-white/10"
					/>
				{:else}
					<div
						class="w-10 h-10 rounded-full bg-navy-800 flex items-center justify-center shrink-0"
					>
						🏈
					</div>
				{/if}
				<div class="flex-1 min-w-0">
					<p class="font-semibold text-white text-sm truncate">{row.teamName}</p>
					<p class="text-xs text-navy-500">{row.ownerName}</p>
				</div>
				<div class="text-right shrink-0">
					<p class="font-bold text-white text-sm tabular-nums">
						{row.wins}–{row.losses}{row.ties > 0 ? `–${row.ties}` : ''}
					</p>
					<p class="text-xs text-navy-500 tabular-nums">{row.fpts.toFixed(0)} pts</p>
				</div>
			</div>
		{/each}
	</div>
{/if}
