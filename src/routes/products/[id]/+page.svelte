<script lang="ts">
	import { enhance } from '$app/forms';
	import PriceChart from '#lib/components/PriceChart.svelte';
	import { date, money, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let mergeTarget = $state('');
</script>

<main>
	<p><a href="/products">← {t('products.title')}</a></p>
	<h1>{data.product.name}</h1>

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
		class="card"
	>
		<label
			><span>{t('common.name')}</span><input
				name="name"
				value={data.product.name}
				required
			/></label
		>
		<label>
			<span>{t('common.category')}</span>
			<select name="categoryId" value={data.product.categoryId ?? ''}>
				<option value="">{t('common.uncategorized')}</option>
				{#each data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</label>
		<div class="row">
			<label class="grow"
				><span>{t('common.unit')}</span><input name="unit" value={data.product.unit ?? ''} /></label
			>
			<label class="grow"
				><span>{t('products.ean')}</span><input
					name="ean"
					value={data.product.ean ?? ''}
					inputmode="numeric"
				/></label
			>
		</div>
		<button class="primary">{t('common.save')}</button>
	</form>

	<h2>{t('products.priceHistory')}</h2>
	{#if data.history.stats}
		{#if data.cheapest}
			<p>
				{data.cheapest.diffCents
					? t('products.cheapest', {
							store: data.cheapest.store,
							diff: money(data.cheapest.diffCents)
						})
					: t('products.cheapestOnly', { store: data.cheapest.store })}
			</p>
		{/if}
		<div class="row stats">
			<div class="card grow">
				<span class="muted">{t('products.latest')}</span><b class="num"
					>{money(data.history.stats.latest)}</b
				>
			</div>
			<div class="card grow">
				<span class="muted">{t('products.min')}</span><b class="num"
					>{money(data.history.stats.min)}</b
				>
			</div>
			<div class="card grow">
				<span class="muted">{t('products.avg')}</span><b class="num"
					>{money(data.history.stats.avg)}</b
				>
			</div>
		</div>
		<div class="card" style="margin-top:0.5rem">
			<PriceChart points={data.history.points} />
		</div>
		<details style="margin-top:0.5rem">
			<summary class="muted">{data.history.points.length}×</summary>
			<ul class="rows" style="margin-top:0.5rem">
				{#each [...data.history.points].reverse() as p, i (i)}
					<li>
						<span class="grow">{date(p.at)} · {p.store}</span>
						<span class="num">{money(p.unitCents)}{p.unit ? `/${p.unit}` : ''}</span>
					</li>
				{/each}
			</ul>
		</details>
	{:else}
		<p class="muted">{t('products.noPrices')}</p>
	{/if}

	<h2>{t('products.merge')}</h2>
	<form method="POST" action="?/merge" class="row">
		<select
			name="targetId"
			bind:value={mergeTarget}
			aria-label={t('products.mergeInto', { name: data.product.name })}
		>
			<option value="">{t('products.mergeInto', { name: data.product.name })}</option>
			{#each data.others as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
		</select>
		<button disabled={!mergeTarget}>{t('products.mergeConfirm')}</button>
	</form>

	<form method="POST" action="?/delete" style="margin-top:2rem">
		<button
			class="danger"
			onclick={(e) => !confirm(t('common.delete') + '?') && e.preventDefault()}
		>
			{t('common.delete')}
		</button>
	</form>
</main>

<style>
	.stats .card {
		display: flex;
		flex-direction: column;
		padding: 0.5rem 0.65rem;
	}
	.stats .muted {
		font-size: 0.8rem;
	}
</style>
