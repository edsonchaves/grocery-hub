<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import ProductInput from '#lib/components/ProductInput.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { ListItemView } from '#lib/types.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const CACHE_KEY = 'gh:list';
	const items = new SvelteMap<number, ListItemView>();
	let highlight = $state<number | null>(null);
	let offline = $state(false);

	$effect.pre(() => {
		items.clear();
		for (const i of data.items) items.set(i.id, i);
	});

	const sorted = $derived(
		[...items.values()].sort(
			(a, b) =>
				Number(a.checked) - Number(b.checked) ||
				(a.categoryOrder ?? Infinity) - (b.categoryOrder ?? Infinity) ||
				a.name.localeCompare(b.name)
		)
	);
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: ListItemView[] }[] = [];
		for (const i of sorted.filter((x) => !x.checked)) {
			const key = String(i.categoryId ?? 'none');
			let g = out.at(-1);
			if (!g || g.key !== key) {
				g = { key, label: i.categoryName ?? t('common.uncategorized'), items: [] };
				out.push(g);
			}
			g.items.push(i);
		}
		return out;
	});
	const checked = $derived(sorted.filter((i) => i.checked));

	$effect(() => {
		localStorage.setItem(CACHE_KEY, JSON.stringify(sorted));
	});

	onMount(() => {
		const es = new EventSource('/api/list/events');
		es.onmessage = (m) => {
			const e = JSON.parse(m.data);
			if (e.type === 'upsert') for (const i of e.items) items.set(i.id, i);
			if (e.type === 'remove') for (const id of e.ids) items.delete(id);
			offline = false;
		};
		es.onerror = () => (offline = !navigator.onLine);
		// catch up on anything missed while the stream was down
		es.onopen = () => {
			if (offline) invalidateAll();
			offline = false;
		};
		const goOffline = () => {
			offline = true;
			if (!items.size) {
				for (const i of JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')) items.set(i.id, i);
			}
		};
		addEventListener('offline', goOffline);
		addEventListener('online', () => invalidateAll());
		if (!navigator.onLine) goOffline();
		return () => {
			es.close();
			removeEventListener('offline', goOffline);
		};
	});

	async function add(p: { productId?: number; text: string }) {
		const res = await fetch('/api/list', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(p.productId ? { productId: p.productId } : { text: p.text })
		});
		if (!res.ok) return;
		const { item, duplicate } = await res.json();
		items.set(item.id, item);
		if (duplicate) {
			highlight = item.id;
			await tick();
			document
				.getElementById(`item-${item.id}`)
				?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			setTimeout(() => (highlight = null), 1600);
		}
	}

	async function toggle(i: ListItemView) {
		items.set(i.id, { ...i, checked: !i.checked });
		await fetch(`/api/list/${i.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ checked: !i.checked })
		});
	}

	async function editQty(i: ListItemView) {
		const qty = prompt(t('common.qty'), i.qty ?? '');
		if (qty === null) return;
		items.set(i.id, { ...i, qty: qty || null });
		await fetch(`/api/list/${i.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ qty })
		});
	}

	async function remove(id: number) {
		items.delete(id);
		await fetch(`/api/list/${id}`, { method: 'DELETE' });
	}

	async function clearChecked() {
		for (const i of checked) items.delete(i.id);
		await fetch('/api/list/clear-checked', { method: 'POST' });
	}
</script>

<main>
	<h1>{t('list.title')}</h1>
	{#if offline}<p class="notice">{t('common.offline')}</p>{/if}

	<ProductInput placeholder={t('list.addPlaceholder')} onpick={add} />

	{#if !items.size}
		<p class="muted" style="margin-top:1.5rem">{t('list.empty')}</p>
	{/if}

	{#each groups as g (g.key)}
		<h2>{g.label}</h2>
		<ul class="rows">
			{#each g.items as i (i.id)}
				{@render row(i)}
			{/each}
		</ul>
	{/each}

	{#if checked.length}
		<div class="row" style="justify-content:space-between;margin-top:1.25rem">
			<h2 style="margin:0">✓ {checked.length}</h2>
			<button onclick={clearChecked}>{t('list.clearChecked')}</button>
		</div>
		<ul class="rows" style="margin-top:0.5rem">
			{#each checked as i (i.id)}
				{@render row(i)}
			{/each}
		</ul>
	{/if}
</main>

{#snippet row(i: ListItemView)}
	<li id="item-{i.id}" class:done={i.checked} class:flash={highlight === i.id}>
		<input type="checkbox" checked={i.checked} onchange={() => toggle(i)} aria-label={i.name} />
		<button class="ghost grow name" onclick={() => toggle(i)}>
			{i.name}
			{#if i.note}<span class="muted"> · {i.note}</span>{/if}
		</button>
		<button class="ghost qty muted" onclick={() => editQty(i)}>{i.qty ?? '＋'}</button>
		<button class="ghost muted" aria-label={t('common.delete')} onclick={() => remove(i.id)}
			>×</button
		>
	</li>
{/snippet}

<style>
	li input[type='checkbox'] {
		width: 24px;
		height: 24px;
		min-height: 0;
		accent-color: var(--accent);
		flex: none;
	}
	.name {
		justify-content: flex-start;
		text-align: left;
		padding: 0.25rem;
	}
	.qty {
		padding: 0.25rem 0.5rem;
		min-width: 44px;
	}
	li.done .name {
		text-decoration: line-through;
		color: var(--muted);
	}
	li.flash {
		animation: flash 1.6s ease;
	}
	@keyframes flash {
		0%,
		60% {
			background: var(--warn-soft);
		}
	}
</style>
