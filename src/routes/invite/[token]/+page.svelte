<script lang="ts">
	import AuthForm from '#lib/components/AuthForm.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if data.valid}
	<AuthForm
		title={t('invite.title')}
		intro={t('invite.intro')}
		submit={t('invite.submit')}
		error={form?.error}
		name={form?.name}
		newPassword
	/>
{:else}
	<main>
		<h1>{t('invite.title')}</h1>
		<p class="notice">{t('invite.invalid')}</p>
	</main>
{/if}
