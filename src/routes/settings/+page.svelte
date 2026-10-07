<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const languages = [
		['pt', 'Português'],
		['de', 'Deutsch'],
		['en', 'English']
	] as const;
</script>

<main>
	<h1>{t('settings.title')}</h1>

	<ul class="rows">
		<li><a class="grow" href="/products">{t('settings.catalog')}</a></li>
		<li><a class="grow" href="/categories">{t('settings.categories')}</a></li>
		<li><a class="grow" href="/purchases">{t('settings.purchases')}</a></li>
	</ul>

	<h2>{t('settings.language')}</h2>
	<form method="POST" action="?/language" use:enhance class="row wrap">
		{#each languages as [code, label] (code)}
			<button name="locale" value={code} class="chip" class:active={data.userLocale === code}>
				{label}
			</button>
		{/each}
	</form>

	<h2>{t('settings.members')}</h2>
	<ul class="rows">
		{#each data.members as m (m.id)}
			<li>
				<span class="grow">{m.name}</span>
				{#if m.isAdmin}<span class="muted">admin</span>{/if}
			</li>
		{/each}
	</ul>

	{#if data.user?.isAdmin}
		<h2>{t('settings.invite')}</h2>
		<form method="POST" action="?/invite" use:enhance>
			<button>{t('settings.inviteCreate')}</button>
		</form>
		{#if form?.inviteUrl}
			<label>
				<span>{t('settings.inviteLink')}</span>
				<input readonly value={form.inviteUrl} onfocus={(e) => e.currentTarget.select()} />
			</label>
		{/if}

		<label>
			<span>{t('settings.widgetToken')}</span>
			<input readonly value={data.widgetToken} onfocus={(e) => e.currentTarget.select()} />
		</label>
	{/if}

	<form method="POST" action="?/logout" style="margin-top:2rem">
		<button class="danger" style="width:100%">{t('settings.logout')}</button>
	</form>
</main>
