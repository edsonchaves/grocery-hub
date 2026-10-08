import type { ParsedReceipt, RawLine, ReviewLine } from './types';

export const MISMATCH_TOLERANCE_CENTS = 5;

const REVIEW_KIND: Record<Exclude<RawLine['kind'], 'discount'>, ReviewLine['kind']> = {
	item: 'item',
	pfand: 'pfand',
	pfand_return: 'pfand',
	order_discount: 'discount',
	fee: 'fee'
};

/**
 * Item discounts go onto the preceding item so its price stays comparable; order discounts,
 * fees, Pfand and Pfand returns stay separate lines.
 */
export function toReviewLines(parsed: ParsedReceipt): ReviewLine[] {
	const out: ReviewLine[] = [];
	let lastItem: ReviewLine | undefined;
	for (const l of parsed.lines) {
		if (l.kind === 'discount') {
			const cents = -Math.abs(l.lineCents);
			if (lastItem) lastItem.discountCents += cents;
			else
				out.push({
					rawName: l.name,
					suggestedName: null,
					qty: 1,
					unit: null,
					lineCents: cents,
					discountCents: 0,
					kind: 'discount'
				});
			continue;
		}
		const line: ReviewLine = {
			rawName: l.name,
			suggestedName: l.suggestedName,
			qty: l.qty,
			unit: l.unit,
			lineCents:
				l.kind === 'pfand_return' || l.kind === 'order_discount'
					? -Math.abs(l.lineCents)
					: l.lineCents,
			discountCents: 0,
			kind: REVIEW_KIND[l.kind]
		};
		out.push(line);
		if (line.kind === 'item') lastItem = line;
	}
	return out;
}

export function linesSum(lines: { lineCents: number; discountCents: number }[]) {
	return lines.reduce((s, l) => s + l.lineCents + l.discountCents, 0);
}

export function totalsMismatch(lines: ReviewLine[], totalCents: number | null) {
	if (totalCents == null || !lines.length) return undefined;
	const sum = linesSum(lines);
	const diff = sum - totalCents;
	return Math.abs(diff) > MISMATCH_TOLERANCE_CENTS ? { sum, total: totalCents, diff } : undefined;
}
