<script lang="ts">
	import { enhance } from '$app/forms';
	import { date, t } from '#lib/i18n.svelte.ts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main>
	<h1>{t('week.title')}</h1>
	<p class="muted">{t('week.empty')}</p>
	<form method="POST" action="?/create" use:enhance class="card">
		<label
			><span>{t('week.start')}</span><input
				type="date"
				name="start"
				value={data.nextStart}
				required
			/></label
		>
		{#if form?.overlap}<p class="notice" role="alert">{t('week.overlap')}</p>{/if}
		<button class="primary" style="width:100%;margin-top:0.5rem">{t('week.create')}</button>
	</form>
	{#if data.last}
		<p style="margin-top:1rem">
			<a href="/week/{data.last}"
				>‹ {date(new Date(`${data.last}T12:00`), { day: 'numeric', month: 'short' })}</a
			>
		</p>
	{/if}
	<p style="margin-top:1rem"><a href="/dishes">{t('dishes.title')}</a></p>
</main>
