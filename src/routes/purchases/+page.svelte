<script lang="ts">
	import { enhance } from '$app/forms';
	import { date, money, t } from '#lib/i18n.svelte.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main>
	<h1>{t('purchases.title')}</h1>
	<p><a href="/purchases/new">{t('receipts.manual')}</a></p>
	{#if data.purchases.length}
		<ul class="rows">
			{#each data.purchases as p (p.id)}
				<li>
					<span class="grow">
						{#if p.receiptId}<a href="/receipts/{p.receiptId}">{p.storeName}</a
							>{:else}{p.storeName}{/if}
						<span class="muted"> · {date(p.purchasedAt)}</span>
					</span>
					<span class="num">{money(p.totalCents)}</span>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={p.id} />
						<button
							class="ghost danger"
							aria-label={t('common.delete')}
							onclick={(e) => !confirm(t('common.delete') + '?') && e.preventDefault()}>×</button
						>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{t('purchases.empty')}</p>
	{/if}
</main>
