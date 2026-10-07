<script lang="ts">
	import { date, money } from '#lib/i18n.svelte.ts';

	type Point = { at: number; store: string; unitCents: number };
	let { points }: { points: Point[] } = $props();

	const W = 320;
	const H = 150;
	const PAD = { l: 44, r: 10, t: 10, b: 22 };

	// colors follow the store (alphabetical), not its rank, so a store keeps its color
	const stores = $derived([...new Set(points.map((p) => p.store))].sort());
	const color = (store: string) => {
		const i = stores.indexOf(store);
		return i < 4 ? `var(--series-${i + 1})` : 'var(--muted)';
	};

	const x0 = $derived(Math.min(...points.map((p) => p.at)));
	const x1 = $derived(Math.max(...points.map((p) => p.at)));
	const yMax = $derived(Math.max(...points.map((p) => p.unitCents)));
	const yMin = $derived(Math.min(...points.map((p) => p.unitCents)));
	const lo = $derived(Math.max(0, yMin - (yMax - yMin || yMax) * 0.2));
	const hi = $derived(yMax + (yMax - yMin || yMax) * 0.1);

	const sx = (t: number) =>
		x1 === x0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
	const sy = (c: number) => H - PAD.b - ((c - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

	const series = $derived(
		stores.map((s) => ({ store: s, pts: points.filter((p) => p.store === s) }))
	);
	const ticks = $derived([lo, (lo + hi) / 2, hi].map((v) => Math.round(v)));

	let hover = $state<Point | null>(null);
</script>

{#if stores.length > 1}
	<div class="legend">
		{#each stores as s (s)}
			<span><i style="background:{color(s)}"></i>{s}</span>
		{/each}
	</div>
{/if}

<div class="wrap">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="price history">
		{#each ticks as v (v)}
			<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} />
			<text class="axis" x={PAD.l - 6} y={sy(v) + 4} text-anchor="end">{money(v)}</text>
		{/each}
		<text class="axis" x={PAD.l} y={H - 6}>{date(x0, { month: 'short', year: '2-digit' })}</text>
		<text class="axis" x={W - PAD.r} y={H - 6} text-anchor="end"
			>{date(x1, { month: 'short', year: '2-digit' })}</text
		>

		{#each series as s (s.store)}
			{#if s.pts.length > 1}
				<polyline
					fill="none"
					stroke={color(s.store)}
					stroke-width="2"
					stroke-linejoin="round"
					points={s.pts.map((p) => `${sx(p.at)},${sy(p.unitCents)}`).join(' ')}
				/>
			{/if}
		{/each}
		{#each points as p, i (i)}
			<circle class="dot" cx={sx(p.at)} cy={sy(p.unitCents)} r="4" fill={color(p.store)} />
			<!-- larger invisible hit target -->
			<circle
				role="presentation"
				cx={sx(p.at)}
				cy={sy(p.unitCents)}
				r="14"
				fill="transparent"
				onpointerenter={() => (hover = p)}
				onpointerleave={() => (hover = null)}
				onclick={() => (hover = p)}
			/>
		{/each}
	</svg>
	{#if hover}
		<div
			class="tip"
			style="left:{(sx(hover.at) / W) * 100}%;top:{(sy(hover.unitCents) / H) * 100}%"
		>
			<i style="background:{color(hover.store)}"></i>
			{hover.store} · <b>{money(hover.unitCents)}</b><br />
			<span class="muted">{date(hover.at)}</span>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		fill: var(--muted);
		font-size: 10px;
	}
	.dot {
		stroke: var(--card);
		stroke-width: 2;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}
	i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-right: 0.3rem;
	}
	.tip {
		position: absolute;
		transform: translate(-50%, calc(-100% - 10px));
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
	}
</style>
