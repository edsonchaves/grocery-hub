<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { money, t } from '#lib/i18n.svelte.ts';
	import { euroInput, parseEuro } from '#lib/money.ts';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Line = {
		rawName: string;
		kind: 'item' | 'pfand' | 'discount' | 'fee';
		qty: number;
		unit: 'pc' | 'kg' | 'l' | null;
		price: string;
		discount: string;
		choice: string;
		newName: string;
		auto: boolean;
		candidates: { id: number; name: string }[];
	};

	const init = () => {
		const r = data.review;
		return {
			store: r?.store ?? '',
			purchasedAt: r?.purchasedAt ?? '',
			total: r?.totalCents != null ? euroInput(r.totalCents) : '',
			lines: (r?.lines ?? []).map<Line>((l) => ({
				rawName: l.rawName,
				kind: l.kind,
				qty: l.qty,
				unit: l.unit,
				price: euroInput(l.lineCents),
				discount: l.discountCents ? euroInput(l.discountCents) : '',
				choice: l.match?.productId ? String(l.match.productId) : l.kind === 'item' ? 'new' : 'skip',
				newName: l.match?.newName ?? l.rawName,
				auto: l.match?.auto ?? false,
				candidates: l.match?.candidates ?? []
			}))
		};
	};
	const KIND_LABEL = {
		pfand: 'receipts.pfand',
		discount: 'receipts.discount',
		fee: 'receipts.fee'
	} as const;

	let draft = $state(init());
	let showAll = $state(false);

	const sum = $derived(
		draft.lines.reduce((s, l) => s + (parseEuro(l.price) || 0) + (parseEuro(l.discount) || 0), 0)
	);
	const totalCents = $derived(parseEuro(draft.total));
	const mismatch = $derived(
		!Number.isNaN(totalCents) && draft.lines.length && Math.abs(sum - totalCents) > 5
			? sum - totalCents
			: 0
	);
	const valid = $derived(
		draft.store.trim() &&
			draft.purchasedAt &&
			!Number.isNaN(totalCents) &&
			draft.lines.every(
				(l) =>
					!Number.isNaN(parseEuro(l.price)) && (!l.discount || !Number.isNaN(parseEuro(l.discount)))
			)
	);

	const payload = (force: boolean) =>
		JSON.stringify({
			store: draft.store,
			purchasedAt: draft.purchasedAt,
			totalCents,
			force,
			lines: draft.lines.map((l) => ({
				rawName: l.rawName,
				kind: l.kind,
				qty: l.qty,
				unit: l.unit,
				lineCents: parseEuro(l.price),
				discountCents: l.discount ? Math.min(0, -Math.abs(parseEuro(l.discount))) : 0,
				productId: /^\d+$/.test(l.choice) ? Number(l.choice) : null,
				newProductName: l.choice === 'new' ? l.newName.trim() || l.rawName : null
			}))
		});

	function addLine() {
		draft.lines.push({
			rawName: '',
			kind: 'item',
			qty: 1,
			unit: null,
			price: '',
			discount: '',
			choice: 'new',
			newName: '',
			auto: false,
			candidates: []
		});
	}

	onMount(() => {
		const timer = setInterval(() => {
			if (data.receipt.status === 'pending') invalidateAll();
		}, 1500);
		return () => clearInterval(timer);
	});

	// re-init the draft once background parsing finishes
	let lastStatus: string | undefined;
	$effect(() => {
		const status = data.receipt.status;
		if (lastStatus === 'pending' && status === 'parsed') draft = init();
		lastStatus = status;
	});
</script>

<main>
	<p><a href="/receipts">← {t('receipts.title')}</a></p>
	<h1>{t('receipts.review')}</h1>

	{#if data.receipt.status === 'pending'}
		<p class="card">⏳ {t('receipts.parsing')}</p>
	{:else if data.receipt.status === 'failed'}
		<p class="notice">
			{data.receipt.error === 'noApiKey'
				? t('receipts.noApiKey')
				: `${t('common.error')} (${data.receipt.error})`}
		</p>
		<form method="POST" action="?/reparse" use:enhance>
			<button>{t('receipts.reparse')}</button>
		</form>
	{:else if data.receipt.status === 'confirmed'}
		<p class="card">✓ {t('receipts.saved')}</p>
	{/if}
	{#if data.receipt.status === 'parsed' && data.receipt.parser}
		<p class="muted">
			{data.receipt.parser === 'vision' ? t('receipts.readByAi') : t('receipts.readFromPdf')}
		</p>
	{/if}

	{#if data.receipt.files.length}
		<details style="margin-bottom:0.75rem">
			<summary class="muted">{data.receipt.files.length} 🗎</summary>
			{#each data.receipt.files as f (f)}
				{#if f.endsWith('.pdf')}
					<a href="/receipts/{data.receipt.id}/file/{f}" target="_blank">{f}</a>
				{:else}
					<img src="/receipts/{data.receipt.id}/file/{f}" alt="" class="scan" />
				{/if}
			{/each}
		</details>
	{/if}

	{#if data.receipt.status === 'parsed' && data.review}
		<datalist id="stores"
			>{#each data.stores as s (s)}<option value={s}></option>{/each}</datalist
		>
		<div class="card">
			<label
				><span>{t('common.store')}</span><input
					bind:value={draft.store}
					list="stores"
					required
				/></label
			>
			<div class="row">
				<label class="grow"
					><span>{t('common.date')}</span><input
						type="datetime-local"
						bind:value={draft.purchasedAt}
						required
					/></label
				>
				<label style="width:7.5rem"
					><span>{t('common.total')}</span><input
						bind:value={draft.total}
						inputmode="decimal"
						required
					/></label
				>
			</div>
		</div>

		{#if mismatch}
			<p class="notice" role="alert">
				{t('receipts.mismatch', {
					sum: money(sum),
					total: money(totalCents),
					diff: money(Math.abs(mismatch))
				})}
			</p>
		{/if}
		{#if data.review.duplicate || form?.duplicate}
			<p class="notice" role="alert">{t('receipts.duplicate')}</p>
		{/if}

		<label class="row" style="margin-top:0.75rem">
			<input type="checkbox" bind:checked={showAll} style="width:auto;min-height:0" />
			<span style="display:inline;margin:0"
				>✓ auto ({draft.lines.filter((l) => l.auto).length})</span
			>
		</label>

		<ul class="rows lines">
			{#each draft.lines as l, i (i)}
				{#if showAll || !l.auto}
					<li>
						<div class="grow">
							<div class="row">
								<input class="raw" bind:value={l.rawName} aria-label={t('receipts.rawName')} />
								{#if l.kind !== 'item'}<span class="chip">{t(KIND_LABEL[l.kind])}</span>{/if}
								<button
									class="ghost danger"
									aria-label={t('common.delete')}
									onclick={() => draft.lines.splice(i, 1)}>×</button
								>
							</div>
							{#if l.kind === 'item'}
								<div class="row">
									<select bind:value={l.choice} aria-label={t('receipts.product')}>
										{#each l.candidates as c (c.id)}<option value={String(c.id)}>{c.name}</option
											>{/each}
										<option value="new">{t('receipts.newProduct')}</option>
										<option value="skip">{t('receipts.skip')}</option>
										<optgroup label={t('products.title')}>
											{#each data.products as p (p.id)}<option value={String(p.id)}>{p.name}</option
												>{/each}
										</optgroup>
									</select>
								</div>
								{#if l.choice === 'new'}
									<input
										bind:value={l.newName}
										placeholder={t('products.new')}
										aria-label={t('products.new')}
									/>
								{/if}
							{/if}
							<div class="row nums">
								<label
									><span>{t('common.qty')}</span><input
										type="number"
										step="any"
										min="0"
										bind:value={l.qty}
									/></label
								>
								<label
									><span>{t('common.price')}</span><input
										bind:value={l.price}
										inputmode="decimal"
									/></label
								>
								{#if l.kind === 'item'}
									<label
										><span>{t('receipts.discount')}</span><input
											bind:value={l.discount}
											inputmode="decimal"
											placeholder="0,00"
										/></label
									>
								{/if}
							</div>
						</div>
					</li>
				{/if}
			{/each}
		</ul>
		<button style="margin-top:0.5rem" onclick={addLine}>+ {t('receipts.addLine')}</button>

		<form
			method="POST"
			action="?/confirm"
			use:enhance={({ formData, submitter }) => {
				formData.set('payload', payload(submitter?.getAttribute('value') === 'force'));
			}}
			style="margin-top:1rem"
		>
			<button class="primary" style="width:100%" disabled={!valid}>{t('receipts.confirm')}</button>
			{#if form?.duplicate}
				<button name="mode" value="force" style="width:100%;margin-top:0.5rem" disabled={!valid}
					>{t('receipts.confirmAnyway')}</button
				>
			{/if}
		</form>
		<form method="POST" action="?/reparse" use:enhance style="margin-top:0.5rem">
			<button class="ghost muted" style="width:100%">{t('receipts.reparse')}</button>
		</form>
	{/if}
</main>

<style>
	.scan {
		width: 100%;
		border-radius: var(--radius);
		margin-top: 0.5rem;
	}
	.lines {
		margin-top: 0.5rem;
	}
	.lines li {
		align-items: flex-start;
	}
	.lines .grow > * + * {
		margin-top: 0.35rem;
	}
	.raw {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
	}
	.nums label {
		flex: 1;
		margin: 0;
	}
</style>
