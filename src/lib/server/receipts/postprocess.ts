import type { ParsedReceipt, ReviewLine } from './types';

export const MISMATCH_TOLERANCE_CENTS = 5;

/** Discounts go onto the preceding item; Pfand and Pfand returns stay separate lines. */
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
					kind: 'item'
				});
			continue;
		}
		const line: ReviewLine = {
			rawName: l.name,
			suggestedName: l.suggestedName,
			qty: l.qty,
			unit: l.unit,
			lineCents: l.kind === 'pfand_return' ? -Math.abs(l.lineCents) : l.lineCents,
			discountCents: 0,
			kind: l.kind === 'item' ? 'item' : 'pfand'
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
