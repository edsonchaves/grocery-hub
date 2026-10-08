<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main>
	<p><a href="/week">← {t('week.title')}</a></p>
	<h1>{t('dishes.title')}</h1>

	<form method="POST" action="?/create" class="row" style="margin-bottom:0.75rem">
		<input
			class="grow"
			name="name"
			placeholder={t('dishes.new')}
			aria-label={t('dishes.new')}
			required
		/>
		<button>{t('common.add')}</button>
	</form>

	{#if !data.dishes.length}
		<p class="muted">{t('dishes.empty')}</p>
	{/if}
	<ul class="rows">
		{#each data.dishes as d (d.id)}
			<li>
				<a class="grow" href="/dishes/{d.id}">{d.name}</a>
				<span class="muted"
					>{d.ingredients
						? t('week.ingredients', { n: d.ingredients })
						: t('week.noIngredients')}</span
				>
			</li>
		{/each}
	</ul>
</main>
