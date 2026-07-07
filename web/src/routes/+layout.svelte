<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvex, setupAuth } from 'convex-svelte';
	import { env } from '$env/dynamic/public';
	import { authStore } from '$lib/auth.svelte.js';
	import { onMount } from 'svelte';

	let { children } = $props();

	const convexUrl = env.PUBLIC_CONVEX_URL;
	if (convexUrl) {
		setupConvex(convexUrl);
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
