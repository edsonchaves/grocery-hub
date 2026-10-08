import type { QtyUnit } from './types';

export type Qty = { qty: number | null; unit: QtyUnit | null };

const BASE: Record<QtyUnit, { base: 'pc' | 'g' | 'ml'; factor: number }> = {
	pc: { base: 'pc', factor: 1 },
	g: { base: 'g', factor: 1 },
	kg: { base: 'g', factor: 1000 },
	ml: { base: 'ml', factor: 1 },
	l: { base: 'ml', factor: 1000 }
};

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function formatQty(qty: number | null, unit: QtyUnit | null) {
	if (qty == null) return '';
	if (!unit || unit === 'pc') return num(qty);
	return `${num(qty)} ${unit}`;
}

/** Sums quantities per base unit (g/kg, ml/l, pieces); null quantities are ignored. */
export function sumQty(items: Qty[]) {
	const totals = new Map<'pc' | 'g' | 'ml', number>();
	for (const { qty, unit } of items) {
		if (qty == null) continue;
		const { base, factor } = BASE[unit ?? 'pc'];
		totals.set(base, (totals.get(base) ?? 0) + qty * factor);
	}
	return [...totals].map(([base, n]): Qty => {
		if (base === 'g' && n >= 1000) return { qty: n / 1000, unit: 'kg' };
		if (base === 'ml' && n >= 1000) return { qty: n / 1000, unit: 'l' };
		return { qty: n, unit: base };
	});
}

export const formatSum = (items: Qty[]) =>
	sumQty(items)
		.map((q) => formatQty(q.qty, q.unit))
		.join(' + ');
