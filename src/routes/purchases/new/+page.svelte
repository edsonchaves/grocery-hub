<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.svelte.ts';
	import { parseEuro } from '#lib/money.ts';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const today = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	let store = $state('');
	let day = $state(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
	let total = $state('');
	let lines = $state<{ name: string; price: string }[]>([]);

	const productId = (name: string) =>
		data.products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
	const valid = $derived(
		store.trim() &&
			day &&
			!Number.isNaN(parseEuro(total)) &&
			lines.every((l) => l.name.trim() && !Number.isNaN(parseEuro(l.price)))
	);
</script>

<main>
	<p><a href="/purchases">← {t('purchases.title')}</a></p>
	<h1>{t('purchases.manualTitle')}</h1>
	{#if form?.duplicate}<p class="notice">{t('receipts.duplicate')}</p>{/if}

	<datalist id="stores"
		>{#each data.stores as s (s)}<option value={s}></option>{/each}</datalist
	>
	<datalist id="products"
		>{#each data.products as p (p.id)}<option value={p.name}></option>{/each}</datalist
	>

	<form
		method="POST"
		use:enhance={({ formData }) => {
			formData.set(
				'payload',
				JSON.stringify({
					store,
					purchasedAt: day,
					totalCents: parseEuro(total),
					force: !!form?.duplicate,
					lines: lines.map((l) => {
						const id = productId(l.name);
						return {
							rawName: l.name.trim(),
							productId: id,
							newProductName: id ? null : l.name.trim(),
							lineCents: parseEuro(l.price)
						};
					})
				})
			);
		}}
	>
		<div class="card">
			<label
				><span>{t('common.store')}</span><input bind:value={store} list="stores" required /></label
			>
			<div class="row">
				<label class="grow"
					><span>{t('common.date')}</span><input type="date" bind:value={day} required /></label
				>
				<label style="width:7.5rem"
					><span>{t('common.total')}</span><input
						bind:value={total}
						inputmode="decimal"
						placeholder="0,00"
						required
					/></label
				>
			</div>
		</div>

		<h2>{t('purchases.linesOptional')}</h2>
		{#each lines as l, i (i)}
			<div class="row" style="margin-bottom:0.4rem">
				<input
					bind:value={l.name}
					list="products"
					placeholder={t('receipts.product')}
					aria-label={t('receipts.product')}
				/>
				<input
					bind:value={l.price}
					inputmode="decimal"
					placeholder="0,00"
					style="width:6.5rem"
					aria-label={t('common.price')}
				/>
				<button
					type="button"
					class="ghost danger"
					aria-label={t('common.delete')}
					onclick={() => lines.splice(i, 1)}>×</button
				>
			</div>
		{/each}
		<button type="button" onclick={() => lines.push({ name: '', price: '' })}
			>+ {t('receipts.addLine')}</button
		>

		<button class="primary" style="width:100%;margin-top:1rem" disabled={!valid}>
			{form?.duplicate ? t('receipts.confirmAnyway') : t('common.save')}
		</button>
	</form>
</main>
