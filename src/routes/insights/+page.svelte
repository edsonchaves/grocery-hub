<script lang="ts">
	import BarList from '#lib/components/BarList.svelte';
	import { date, money, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const key = (y: number, m: number) => {
		const d = new Date(y, m - 1, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	};
	const o = $derived(data.overview);
	const signed = (c: number) => (c > 0 ? '▲ +' : c < 0 ? '▼ −' : '') + money(Math.abs(c));

	const categories = $derived(
		o.byCategory.map((c) => ({
			...c,
			label:
				c.key === 'pfand' || c.key === 'discount' || c.key === 'fee'
					? t(`insights.${c.key}`)
					: (c.label ?? t('common.uncategorized'))
		}))
	);
	const storeRows = $derived(o.byStore.map((s) => ({ ...s, label: s.label ?? '' })));
</script>

<main>
	<h1>{t('insights.title')}</h1>

	<div class="row month">
		<a class="button" href="?m={key(data.year, data.month - 1)}" aria-label="‹">‹</a>
		<b class="grow"
			>{date(new Date(data.year, data.month - 1, 1), { month: 'long', year: 'numeric' })}</b
		>
		<a class="button" href="?m={key(data.year, data.month + 1)}" aria-label="›">›</a>
	</div>

	<div class="kpis">
		<div class="card hero">
			<span class="muted">{t('common.total')}</span>
			<b class="num">{money(o.total)}</b>
		</div>
		<div class="card">
			<span class="muted">{t('insights.vsPrev')}</span>
			<b class="num">{signed(o.deltaPrev)}</b>
		</div>
		<div class="card">
			<span class="muted">{t('insights.vsAvg')}</span>
			<b class="num">{signed(o.deltaAvg)}</b>
		</div>
	</div>

	{#if o.total === 0}
		<p class="muted">{t('insights.noData')}</p>
	{:else}
		<h2>{t('insights.byCategory')}</h2>
		<BarList rows={categories} />
		<h2>{t('insights.byStore')}</h2>
		<BarList rows={storeRows} />
	{/if}

	<h2>{t('insights.prices')}</h2>
	<p><a href="/products">{t('products.title')} →</a></p>
</main>

<style>
	.month {
		margin-bottom: 0.75rem;
		text-align: center;
		text-transform: capitalize;
	}
	.kpis {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.kpis .card {
		display: flex;
		flex-direction: column;
	}
	.kpis .muted {
		font-size: 0.8rem;
	}
	.hero {
		grid-column: 1 / -1;
	}
	.hero b {
		font-size: 2rem;
	}
</style>
