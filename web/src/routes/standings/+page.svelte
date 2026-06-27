<script lang="ts">
	import type { PageData } from './$types';
	import StandingsTable from '$lib/components/StandingsTable.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-screen bg-navy-950 px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-4xl">
		<div class="mb-6">
			<h1 class="font-sport font-black text-5xl uppercase tracking-tight text-white leading-none">
				Standings
			</h1>
			<p class="text-navy-500 text-[10px] uppercase tracking-[0.2em] font-semibold mt-1">
				{data.season} Season
			</p>
		</div>

		<StandingsTable rows={data.rows} />
	</div>
</div>
