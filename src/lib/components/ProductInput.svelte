<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';

	type Hit = { id: number; name: string; categoryName: string | null };

	let {
		placeholder,
		onpick
	}: {
		placeholder: string;
		onpick: (pick: { productId?: number; text: string }) => void | Promise<void>;
	} = $props();

	let text = $state('');
	let hits = $state<Hit[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function search() {
		clearTimeout(timer);
		const q = text.trim();
		if (!q) {
			hits = [];
			return;
		}
		timer = setTimeout(async () => {
			const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`);
			if (res.ok && text.trim() === q) {
				hits = await res.json();
				open = true;
			}
		}, 150);
	}

	async function pick(p: { productId?: number; text: string }) {
		if (!p.text.trim()) return;
		text = '';
		hits = [];
		open = false;
		await onpick(p);
	}

	const exact = $derived(hits.some((h) => h.name.toLowerCase() === text.trim().toLowerCase()));
</script>

<form
	class="wrap"
	onsubmit={(e) => {
		e.preventDefault();
		const top = hits.find((h) => h.name.toLowerCase() === text.trim().toLowerCase());
		pick(top ? { productId: top.id, text: top.name } : { text });
	}}
>
	<input
		bind:value={text}
		oninput={search}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		{placeholder}
		autocomplete="off"
		enterkeyhint="done"
		aria-label={placeholder}
	/>
	{#if open && text.trim() && (hits.length || !exact)}
		<ul class="rows menu">
			{#each hits as h (h.id)}
				<li>
					<button
						type="button"
						class="ghost grow"
						onclick={() => pick({ productId: h.id, text: h.name })}
					>
						<span class="grow" style="text-align:left">{h.name}</span>
						{#if h.categoryName}<span class="muted">{h.categoryName}</span>{/if}
					</button>
				</li>
			{/each}
			{#if !exact}
				<li>
					<button type="button" class="ghost grow" onclick={() => pick({ text })}>
						<span class="grow" style="text-align:left"
							>{t('list.newProduct', { name: text.trim() })}</span
						>
					</button>
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
	}
</style>
