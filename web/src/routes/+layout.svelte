<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvex, setupAuth } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { authStore } from '$lib/auth.svelte.js';
	import { onMount } from 'svelte';

	let { children } = $props();

	if (PUBLIC_CONVEX_URL) {
		setupConvex(PUBLIC_CONVEX_URL);
		setupAuth(() => ({
			isLoading: authStore.isLoading,
			isAuthenticated: authStore.isAuthenticated,
			fetchAccessToken: (opts) => authStore.fetchAccessToken(opts),
		}));
	}

	onMount(() => {
		authStore.init();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
