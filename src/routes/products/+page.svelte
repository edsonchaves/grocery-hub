<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let q = $state('');

	const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
	const shown = $derived(
		q ? data.products.filter((p) => key(p.name).includes(key(q))) : data.products
	);
</script>

<main>
	<h1>{t('products.title')}</h1>

	<form method="POST" action="?/create" class="row" style="margin-bottom:0.75rem">
		<input name="name" placeholder={t('products.new')} required />
		<select name="categoryId" style="max-width:40%" aria-label={t('common.category')}>
			<option value="">{t('common.uncategorized')}</option>
			{#each data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</select>
		<button class="primary">{t('common.add')}</button>
	</form>

	<input type="search" bind:value={q} placeholder={t('products.search')} />

	<ul class="rows" style="margin-top:0.75rem">
		{#each shown as p (p.id)}
			<li>
				<a class="grow" href="/products/{p.id}">{p.name}</a>
				<span class="muted">{p.categoryName ?? t('common.uncategorized')}</span>
			</li>
		{/each}
	</ul>
</main>
