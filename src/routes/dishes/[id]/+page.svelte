<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ProductInput from '#lib/components/ProductInput.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import { QTY_UNITS } from '#lib/types.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let qty = $state('');
	let unit = $state<(typeof QTY_UNITS)[number]>('g');

	const unitLabel = (u: string) => (u === 'pc' ? t('dishes.unitPc') : u);
	const submit = (e: Event) => (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();

	async function add(p: { productId?: number; text: string }) {
		const body = new FormData();
		if (p.productId) body.set('productId', String(p.productId));
		body.set('text', p.text);
		body.set('qty', qty);
		body.set('unit', unit);
		await fetch('?/ingredient', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		qty = '';
		await invalidateAll();
	}
</script>

<main>
	<p><a href={data.back}>← {t('common.back')}</a></p>

	<form method="POST" action="?/rename" use:enhance>
		<input
			class="title"
			name="name"
			value={data.dish.name}
			aria-label={t('common.name')}
			onchange={submit}
			required
		/>
	</form>

	<h2>{t('dishes.ingredients')}</h2>
	<ul class="rows">
		{#each data.dish.ingredients as i (i.productId)}
			<li>
				<span class="grow">{i.name}</span>
				<form method="POST" action="?/ingredient" use:enhance class="row qty">
					<input type="hidden" name="productId" value={i.productId} />
					<input
						name="qty"
						inputmode="decimal"
						value={i.qty == null ? '' : String(i.qty).replace('.', ',')}
						placeholder={t('common.qty')}
						aria-label={t('common.qty')}
						onchange={submit}
					/>
					<select name="unit" value={i.unit ?? 'g'} aria-label={t('common.unit')} onchange={submit}>
						{#each QTY_UNITS as u (u)}<option value={u}>{unitLabel(u)}</option>{/each}
					</select>
				</form>
				<form method="POST" action="?/removeIngredient" use:enhance>
					<input type="hidden" name="productId" value={i.productId} />
					<button class="ghost danger" aria-label={t('common.delete')}>×</button>
				</form>
			</li>
		{/each}
	</ul>

	<div class="row add">
		<div class="grow"><ProductInput placeholder={t('dishes.addIngredient')} onpick={add} /></div>
		<input
			class="qtyIn"
			bind:value={qty}
			inputmode="decimal"
			placeholder={t('common.qty')}
			aria-label={t('common.qty')}
		/>
		<select bind:value={unit} aria-label={t('common.unit')}>
			{#each QTY_UNITS as u (u)}<option value={u}>{unitLabel(u)}</option>{/each}
		</select>
	</div>

	<form
		method="POST"
		action="?/delete&back={encodeURIComponent(data.back)}"
		style="margin-top:2rem"
	>
		<button class="ghost danger">{t('common.delete')}</button>
	</form>
</main>

<style>
	.title {
		font-size: 1.4rem;
		font-weight: 600;
	}
	.qty input {
		width: 4.5rem;
	}
	.qty select,
	.add select {
		width: auto;
	}
	.add {
		margin-top: 0.75rem;
		align-items: flex-start;
	}
	.qtyIn {
		width: 4.5rem;
	}
</style>
