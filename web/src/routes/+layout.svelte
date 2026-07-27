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
		authStore.init({
			apiKey: env.PUBLIC_FIREBASE_API_KEY,
			authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
			projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
			storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
			messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
			appId: env.PUBLIC_FIREBASE_APP_ID
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
