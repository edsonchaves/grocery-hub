<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import PlanInput, { type PlanPick } from '#lib/components/PlanInput.svelte';
	import { date, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Missing = { dishId: number; items: { productId: number; name: string }[] };

	const day = (d: string, opts: Intl.DateTimeFormatOptions) => date(new Date(`${d}T12:00`), opts);
	const short = { day: 'numeric', month: 'short' } as const;
	const view = $derived(data.view);

	let adding = $state<string | null>(null);
	let missing = $state<Missing | null>(null);

	async function post(action: string, fields: Record<string, string | string[]>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) {
			for (const x of Array.isArray(v) ? v : [v]) body.append(k, x);
		}
		const res = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text());
	}

	async function add(date: string | null, p: PlanPick | { kind: 'leftovers' }) {
		adding = null;
		const id = p.kind === 'dish' ? p.dishId : p.kind === 'product' ? p.productId : undefined;
		const result = await post('add', {
			date: date ?? '',
			kind: p.kind,
			name: 'name' in p ? p.name : '',
			id: id ? String(id) : ''
		});
		if (result.type === 'success' && result.data) {
			const r = result.data as Partial<Missing> & {
				newDish?: boolean;
				missing?: Missing['items'];
			};
			if (r.newDish) return goto(`/dishes/${r.dishId}?back=/week/${view.startDate}`);
			missing = r.missing?.length ? { dishId: r.dishId!, items: r.missing } : null;
		}
		await invalidateAll();
	}

	async function addMissing() {
		if (!missing) return;
		await post('addMissing', {
			dishId: String(missing.dishId),
			productId: missing.items.map((i) => String(i.productId))
		});
		missing = null;
	}
</script>

{#snippet entries(list: PageData['view']['wholeWeek'], key: string, dateValue: string | null)}
	<ul class="rows">
		{#each list as e (e.id)}
			<li>
				<span aria-hidden="true"
					>{e.kind === 'dish' ? '🍲' : e.kind === 'product' ? '🛒' : '♻'}</span
				>
				<div class="grow">
					{#if e.kind === 'dish'}
						<a href="/dishes/{e.dishId}?back=/week/{view.startDate}">{e.name}</a>
						<div class="muted small">
							{data.ingredientCounts[e.dishId!]
								? t('week.ingredients', { n: data.ingredientCounts[e.dishId!] })
								: t('week.noIngredients')}
						</div>
					{:else if e.kind === 'product'}
						{e.name}{#if e.qty}<span class="muted"> · {e.qty}</span>{/if}
					{:else}
						<span class="muted">{t('week.leftovers')}</span>
					{/if}
				</div>
				<form method="POST" action="?/remove" use:enhance>
					<input type="hidden" name="entryId" value={e.id} />
					<button class="ghost danger" aria-label={t('common.delete')}>×</button>
				</form>
			</li>
		{/each}
	</ul>
	{#if adding === key}
		<div class="row add">
			<div class="grow"><PlanInput onpick={(p) => add(dateValue, p)} /></div>
			{#if dateValue}
				<button class="ghost" onclick={() => add(dateValue, { kind: 'leftovers' })}
					>♻ {t('week.leftovers')}</button
				>
			{/if}
		</div>
	{:else}
		<button class="ghost muted" onclick={() => (adding = key)}>+ {t('common.add')}</button>
	{/if}
{/snippet}

<main>
	<div class="row head">
		{#if data.prev}
			<a class="button" href="/week/{data.prev}" aria-label="‹">‹</a>
		{/if}
		<h1 class="grow">{day(view.startDate, short)} – {day(view.endDate, short)}</h1>
		{#if data.next}
			<a class="button" href="/week/{data.next}" aria-label="›">›</a>
		{:else}
			<form method="POST" action="/week?/create">
				<input type="hidden" name="start" value={data.nextStart} />
				<button title={t('week.new')}>{t('week.new')}</button>
			</form>
		{/if}
	</div>

	{#if data.canCopy}
		<form method="POST" action="?/copy" use:enhance style="margin-bottom:0.75rem">
			<button style="width:100%">{t('week.copy')}</button>
		</form>
	{/if}

	{#if missing}
		<div class="notice" role="alert">
			{t('week.missing', { items: missing.items.map((i) => i.name).join(', ') })}
			<button class="primary" style="margin-top:0.5rem" onclick={addMissing}
				>{t('week.addMissing')}</button
			>
		</div>
	{/if}

	<section class="card">
		<h2>{t('week.wholeWeek')}</h2>
		{@render entries(view.wholeWeek, 'week', null)}
	</section>

	{#each view.days as d (d.date)}
		<section class="card" class:today={d.date === data.today}>
			<h2 class="dayname">{day(d.date, { weekday: 'long', day: 'numeric' })}</h2>
			{@render entries(d.entries, d.date, d.date)}
		</section>
	{/each}

	<a class="button primary prepare" href="/week/{view.startDate}/prepare">{t('week.prepare')} ▸</a>
	<p style="margin-top:1rem"><a href="/dishes">{t('dishes.title')}</a></p>
</main>

<style>
	.head {
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.head h1 {
		margin: 0;
		text-align: center;
		font-size: 1.25rem;
	}
	section {
		margin-bottom: 0.75rem;
	}
	section h2 {
		margin-top: 0;
	}
	.dayname::first-letter {
		text-transform: uppercase;
	}
	.today {
		outline: 2px solid var(--series-1);
	}
	.small {
		font-size: 0.85rem;
	}
	.add {
		margin-top: 0.5rem;
		align-items: flex-start;
	}
	.prepare {
		display: block;
		text-align: center;
		margin-top: 1rem;
	}
</style>
