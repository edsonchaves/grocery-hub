<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ProductInput from '#lib/components/ProductInput.svelte';
	import { date, t } from '#lib/i18n.svelte.ts';
	import { PANTRY_STATUSES } from '#lib/types.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: typeof data.products }[] = [];
		for (const p of data.products) {
			const key = String(p.categoryId ?? 'none');
			let g = out.at(-1);
			if (!g || g.key !== key) {
				g = { key, label: p.categoryName ?? t('common.uncategorized'), items: [] };
				out.push(g);
			}
			g.items.push(p);
		}
		return out;
	});

	async function track(p: { productId?: number; text: string }) {
		const body = new FormData();
		if (p.productId) body.set('productId', String(p.productId));
		body.set('text', p.text);
		await fetch('?/track', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		await invalidateAll();
	}
</script>

<main>
	<h1>{t('pantry.title')}</h1>

	<div class="row wrap" style="margin-bottom:0.75rem">
		<a class="chip" class:active={!data.status} href="?">{t('pantry.all')}</a>
		{#each PANTRY_STATUSES as s (s)}
			<a class="chip" class:active={data.status === s} href="?status={s}">{t(`pantry.${s}`)}</a>
		{/each}
	</div>

	<ProductInput placeholder={t('pantry.track')} onpick={track} />

	{#if !data.products.length}
		<p class="muted" style="margin-top:1.5rem">{t('pantry.empty')}</p>
	{/if}

	{#each groups as g (g.key)}
		<h2>{g.label}</h2>
		<ul class="rows">
			{#each g.items as p (p.productId)}
				<li class="item">
					<div class="grow">
						<a href="/products/{p.productId}" class="name">{p.name}</a>
						{#if p.lastRestockAt}
							<div class="muted">{t('pantry.lastRestock', { date: date(p.lastRestockAt) })}</div>
						{/if}
					</div>
					<form method="POST" action="?/status" use:enhance class="seg">
						<input type="hidden" name="productId" value={p.productId} />
						{#each PANTRY_STATUSES as s (s)}
							<button name="status" value={s} class="s-{s}" class:on={p.status === s}
								>{t(`pantry.${s}`)}</button
							>
						{/each}
					</form>
					{#if p.status === 'low' && !data.onList.includes(p.productId)}
						<form method="POST" action="?/addToList" use:enhance>
							<input type="hidden" name="productId" value={p.productId} />
							<button class="ghost" aria-label={t('pantry.addToList')} title={t('pantry.addToList')}
								>＋☑</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
</main>

<style>
	.item {
		flex-wrap: wrap;
	}
	.name {
		color: inherit;
		text-decoration: none;
	}
	.seg {
		display: flex;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.seg button {
		border: 0;
		border-radius: 0;
		min-height: 38px;
		padding: 0.25rem 0.55rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.seg button + button {
		border-left: 1px solid var(--line);
	}
	.seg .on.s-in_stock {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.seg .on.s-low {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.seg .on.s-out {
		background: var(--danger);
		color: #fff;
	}
</style>
