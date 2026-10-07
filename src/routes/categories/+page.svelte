<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main>
	<h1>{t('categories.title')}</h1>

	<form method="POST" action="?/create" use:enhance class="row" style="margin-bottom:0.75rem">
		<input name="name" placeholder={t('categories.new')} required />
		<button class="primary">{t('common.add')}</button>
	</form>

	<ul class="rows">
		{#each data.categories as c, i (c.id)}
			<li>
				<form
					method="POST"
					action="?/rename"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
					class="row grow"
				>
					<input type="hidden" name="id" value={c.id} />
					<input
						name="name"
						value={c.name}
						aria-label={t('common.name')}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					<!-- default button, so Enter renames instead of moving up -->
					<button hidden aria-hidden="true" tabindex="-1"></button>
					<button class="ghost" formaction="?/up" disabled={i === 0} aria-label={t('categories.up')}
						>↑</button
					>
					<button
						class="ghost"
						formaction="?/down"
						disabled={i === data.categories.length - 1}
						aria-label={t('categories.down')}>↓</button
					>
					<button
						class="ghost danger"
						formaction="?/delete"
						aria-label={t('common.delete')}
						onclick={(e) => !confirm(t('categories.deleteHint')) && e.preventDefault()}>×</button
					>
				</form>
			</li>
		{/each}
	</ul>
	<p class="muted">{t('categories.deleteHint')}</p>
</main>
