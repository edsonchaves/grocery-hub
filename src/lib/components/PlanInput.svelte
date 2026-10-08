<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';

	export type PlanPick =
		| { kind: 'dish'; dishId?: number; name: string }
		| { kind: 'product'; productId?: number; name: string };

	type Hit = { id: number; name: string };

	let { onpick }: { onpick: (pick: PlanPick) => void | Promise<void> } = $props();

	let text = $state('');
	let dishes = $state<Hit[]>([]);
	let products = $state<Hit[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function search() {
		clearTimeout(timer);
		const q = text.trim();
		if (!q) {
			dishes = products = [];
			return;
		}
		timer = setTimeout(async () => {
			const res = await fetch(`/api/plan-search?q=${encodeURIComponent(q)}`);
			if (res.ok && text.trim() === q) {
				({ dishes, products } = await res.json());
				open = true;
			}
		}, 150);
	}

	async function pick(p: PlanPick) {
		if (!p.name.trim()) return;
		text = '';
		dishes = products = [];
		open = false;
		await onpick(p);
	}

	const same = (h: Hit) => h.name.toLowerCase() === text.trim().toLowerCase();
</script>

<form
	class="wrap"
	onsubmit={(e) => {
		e.preventDefault();
		const dish = dishes.find(same);
		const product = products.find(same);
		if (dish) pick({ kind: 'dish', dishId: dish.id, name: dish.name });
		else if (product) pick({ kind: 'product', productId: product.id, name: product.name });
		else pick({ kind: 'dish', name: text });
	}}
>
	<input
		bind:value={text}
		oninput={search}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		placeholder={t('week.add')}
		autocomplete="off"
		enterkeyhint="done"
		aria-label={t('week.add')}
	/>
	{#if open && text.trim()}
		<ul class="rows menu">
			{#each dishes as d (`d${d.id}`)}
				<li>
					<button
						type="button"
						class="ghost grow"
						onclick={() => pick({ kind: 'dish', dishId: d.id, name: d.name })}>🍲 {d.name}</button
					>
				</li>
			{/each}
			{#each products as p (`p${p.id}`)}
				<li>
					<button
						type="button"
						class="ghost grow"
						onclick={() => pick({ kind: 'product', productId: p.id, name: p.name })}
						>🛒 {p.name}</button
					>
				</li>
			{/each}
			{#if !dishes.some(same)}
				<li>
					<button
						type="button"
						class="ghost grow"
						onclick={() => pick({ kind: 'dish', name: text })}
						>{t('week.newDish', { name: text.trim() })}</button
					>
				</li>
			{/if}
			{#if !products.some(same)}
				<li>
					<button
						type="button"
						class="ghost grow"
						onclick={() => pick({ kind: 'product', name: text })}
						>{t('week.newProduct', { name: text.trim() })}</button
					>
				</li>
			{/if}
		</ul>
	{/if}
</form>

<style>
	.wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		inset: calc(100% + 4px) 0 auto 0;
		z-index: 5;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
	}
	.menu li {
		padding: 0;
		min-height: 0;
	}
	.menu button {
		width: 100%;
		border-radius: 0;
		justify-content: flex-start;
		text-align: left;
	}
</style>
