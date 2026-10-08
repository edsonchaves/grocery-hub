<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import { page } from '$app/state';
	import { t } from '#lib/i18n.svelte.ts';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	const nav = [
		{ href: '/', key: 'nav.list', icon: '☑' },
		{ href: '/week', key: 'nav.week', icon: '▦' },
		{ href: '/pantry', key: 'nav.pantry', icon: '▤' },
		{ href: '/receipts', key: 'nav.receipts', icon: '⎙' },
		{ href: '/insights', key: 'nav.insights', icon: '€' },
		{ href: '/settings', key: 'nav.more', icon: '⋯' }
	] as const;

	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<title>{t('app.name')}</title>
</svelte:head>

{@render children()}

{#if data.user}
	<nav>
		{#each nav as item (item.href)}
			<a href={item.href} class:active={active(item.href)}>
				<span aria-hidden="true">{item.icon}</span>
				{t(item.key)}
			</a>
		{/each}
	</nav>
{/if}

<style>
	nav {
		position: fixed;
		inset: auto 0 0 0;
		display: flex;
		background: var(--card);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
		z-index: 10;
	}
	a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.45rem 0 0.4rem;
		font-size: 0.75rem;
		color: var(--muted);
		text-decoration: none;
	}
	a span {
		font-size: 1.25rem;
		line-height: 1.2;
	}
	a.active {
		color: var(--accent);
	}
</style>
