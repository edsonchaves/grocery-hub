<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.svelte.ts';
	import type { MessageKey } from '#lib/i18n/index.ts';

	let {
		title,
		intro,
		submit,
		error,
		name = '',
		newPassword = false,
		extra
	}: {
		title: string;
		intro?: string;
		submit: string;
		error?: string;
		name?: string;
		newPassword?: boolean;
		extra?: Snippet;
	} = $props();
</script>

<main>
	<h1>{title}</h1>
	{#if intro}<p class="muted">{intro}</p>{/if}
	{#if error}<p class="notice" role="alert">{t(error as MessageKey)}</p>{/if}
	<form method="POST" use:enhance>
		{@render extra?.()}
		<label>
			<span>{t('common.name')}</span>
			<input name="name" value={name} autocomplete="username" required />
		</label>
		<label>
			<span>{t('common.password')}</span>
			<input
				name="password"
				type="password"
				autocomplete={newPassword ? 'new-password' : 'current-password'}
				minlength={newPassword ? 8 : undefined}
				required
			/>
		</label>
		<button class="primary" style="width:100%">{submit}</button>
	</form>
</main>
