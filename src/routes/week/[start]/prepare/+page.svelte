<script lang="ts">
	import { date, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Candidate = PageData['candidates'][number];

	const day = (d: string) => date(new Date(`${d}T12:00`), { day: 'numeric', month: 'short' });
	const of = (elsewhere: boolean, state: Candidate['state']) =>
		data.candidates.filter((c) => c.elsewhere === elsewhere && c.state === state);
	const have = $derived(data.candidates.filter((c) => c.state === 'have'));
	const onList = $derived(data.candidates.filter((c) => c.state === 'on_list'));
	const elsewhere = $derived(
		data.candidates.filter((c) => c.elsewhere && (c.state === 'need' || c.state === 'ask'))
	);
</script>

{#snippet detail(c: Candidate)}
	<span class="grow">
		{c.name}
		<span class="muted small"
			>{[
				c.qty,
				c.dishes.length ? `p/ ${c.dishes.join(', ')}` : c.restock ? t('prepare.restock') : ''
			]
				.filter(Boolean)
				.join(' · ')}</span
		>
	</span>
{/snippet}

{#snippet rows(need: Candidate[], ask: Candidate[])}
	<ul class="rows">
		{#each need as c (c.productId)}
			<li>
				<label class="row grow pick">
					<input type="checkbox" name="add" value={c.productId} checked />
					{@render detail(c)}
				</label>
			</li>
		{/each}
		{#each ask as c (c.productId)}
			<li class="ask">
				{@render detail(c)}
				<span class="seg" role="radiogroup" aria-label={t('prepare.ask')}>
					<label
						><input type="radio" name="ask-{c.productId}" value="have" />{t('prepare.yes')}</label
					>
					<label><input type="radio" name="ask-{c.productId}" value="add" />{t('prepare.no')}</label
					>
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

<main>
	<p><a href="/week/{data.startDate}">← {day(data.startDate)} – {day(data.endDate)}</a></p>
	<h1>{t('prepare.title')}</h1>

	{#if !data.candidates.length}
		<p class="muted">{t('prepare.nothing')}</p>
	{:else}
		<form method="POST" action="?/confirm">
			{#if of(false, 'need').length || of(false, 'ask').length}
				<h2>{t('prepare.need')}{data.mainStore ? ` · ${data.mainStore}` : ''}</h2>
				{#if of(false, 'ask').length}<p class="muted small">{t('prepare.ask')}</p>{/if}
				{@render rows(of(false, 'need'), of(false, 'ask'))}
			{/if}

			{#if elsewhere.length}
				<h2>{t('prepare.elsewhere', { store: data.mainStore ?? '' })}</h2>
				{@render rows(of(true, 'need'), of(true, 'ask'))}
			{/if}

			{#if have.length}
				<details>
					<summary class="muted">{t('prepare.have', { n: have.length })}</summary>
					<ul class="rows">
						{#each have as c (c.productId)}
							<li>
								<label class="row grow pick">
									<input type="checkbox" name="add" value={c.productId} />
									{@render detail(c)}
								</label>
							</li>
						{/each}
					</ul>
				</details>
			{/if}

			{#if onList.length}
				<details>
					<summary class="muted">{t('prepare.onList', { n: onList.length })}</summary>
					<ul class="rows">
						{#each onList as c (c.productId)}
							<li class="muted">{c.name}</li>
						{/each}
					</ul>
				</details>
			{/if}

			<button class="primary confirm">{t('prepare.confirm')}</button>
		</form>
	{/if}
</main>

<style>
	h2 {
		margin-top: 1rem;
	}
	.pick {
		align-items: center;
		margin: 0;
	}
	.pick input {
		width: auto;
		min-height: 0;
	}
	.ask {
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
	}
	.seg label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.seg input {
		width: auto;
		min-height: 0;
	}
	.small {
		display: block;
		font-size: 0.85rem;
	}
	details {
		margin-top: 1rem;
	}
	.confirm {
		width: 100%;
		margin-top: 1.25rem;
	}
</style>
