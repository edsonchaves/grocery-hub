<script lang="ts">
	import { date, money, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state(false);
	let form: HTMLFormElement;

	const submit = () => {
		busy = true;
		form.requestSubmit();
	};
</script>

<main>
	<h1>{t('receipts.title')}</h1>

	<form
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		bind:this={form}
		class="card upload"
		onsubmit={() => (busy = true)}
	>
		{#if !data.visionEnabled}<p class="notice">{t('receipts.noApiKey')}</p>{/if}
		<label class="button primary">
			📷 {t('receipts.photo')}
			<input
				type="file"
				name="files"
				accept="image/*"
				capture="environment"
				multiple
				onchange={submit}
				hidden
			/>
		</label>
		<label class="button">
			{t('receipts.file')}
			<input
				type="file"
				name="files"
				accept="image/*,.heic,.heif,application/pdf"
				multiple
				onchange={submit}
				hidden
			/>
		</label>
		{#if busy}<p class="muted">{t('receipts.parsing')}</p>{/if}
	</form>

	<p><a href="/purchases/new">{t('receipts.manual')}</a></p>

	{#if data.receipts.length}
		<ul class="rows">
			{#each data.receipts as r (r.id)}
				<li>
					<a class="grow" href="/receipts/{r.id}">
						{r.storeName ?? (r.kind === 'pdf' ? 'eBon' : '📷')} · {date(r.createdAt)}
					</a>
					{#if r.totalCents != null}<span class="num">{money(r.totalCents)}</span>{/if}
					<span class="chip" class:active={r.status === 'parsed'}
						>{t(`receipts.status.${r.status}`)}</span
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{t('receipts.empty')}</p>
	{/if}
</main>

<style>
	.upload {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.upload label {
		margin: 0;
		width: 100%;
	}
</style>
