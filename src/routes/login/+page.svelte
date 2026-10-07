<script lang="ts">
	import AuthForm from '#lib/components/AuthForm.svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<AuthForm
	title={t('login.title')}
	submit={t('login.submit')}
	error={form?.error}
	name={form?.name}
/>
