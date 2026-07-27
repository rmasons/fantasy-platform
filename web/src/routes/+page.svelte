<script lang="ts">
	import { authStore } from '$lib/auth.svelte.js';
</script>

<main>
	<h1>Fantasy Platform</h1>

	{#if authStore.isLoading}
		<p>Loading…</p>
	{:else if authStore.isAuthenticated}
		<p>Signed in as {authStore.user?.email ?? 'unknown'}.</p>
		<a href="/standings">Standings</a>
		<button onclick={() => authStore.signOut()}>Sign out</button>
	{:else}
		<button onclick={() => authStore.signIn()}>Sign in with Google</button>
	{/if}
</main>
