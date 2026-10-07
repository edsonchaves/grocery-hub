<script lang="ts">
	import AuthForm from '#lib/components/AuthForm.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<AuthForm
	title={t('setup.title')}
	intro={t('setup.intro')}
	submit={t('setup.submit')}
	error={form?.error && `auth.${form.error}`}
	name={form?.name}
	newPassword
>
	{#snippet extra()}
		<label>
			<span>{t('setup.household')}</span>
			<input name="household" required />
		</label>
	{/snippet}
</AuthForm>
