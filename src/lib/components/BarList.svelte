<script lang="ts">
	import { money } from '#lib/i18n.svelte.ts';

	let { rows }: { rows: { key: string; label: string; cents: number }[] } = $props();
	const max = $derived(Math.max(...rows.map((r) => r.cents), 1));
</script>

<ul class="rows bars">
	{#each rows as r (r.key)}
		<li title="{r.label}: {money(r.cents)}">
			<div class="grow">
				<div class="row">
					<span class="grow">{r.label}</span>
					<span class="num">{money(r.cents)}</span>
				</div>
				<div class="track">
					<div class="bar" style="width:{Math.max(0, (r.cents / max) * 100)}%"></div>
				</div>
			</div>
		</li>
	{/each}
</ul>

<style>
	.bars li {
		min-height: 0;
		padding: 0.5rem 0.75rem;
	}
	.track {
		height: 8px;
		margin-top: 0.3rem;
	}
	.bar {
		height: 100%;
		background: var(--series-1);
		border-radius: 0 4px 4px 0;
		min-width: 2px;
	}
</style>
