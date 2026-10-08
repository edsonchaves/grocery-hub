import { cents, pdfLinesParser } from './rewe';
import { UnrecognizedReceipt, type ParsedReceipt, type RawLine } from './types';

export const REWE_ONLINE_STORE = 'REWE online';

// Produkt  Menge  MwSt.  Einzelpreis  Gesamt — Menge is a count or grams for weighed items
const ROW =
	/^(.+?)\s{2,}(\d+)(g?)\s{2,}(?:A|B|A\/B)\s{2,}-?\d+,\d{2} €(?:\/kg)?\s{2,}(-?\d{1,3}(?:\.\d{3})*,\d{2}) €$/;
const TOTAL = /^Gesamtsumme\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}) €$/;
const dateAfter = (label: string) => new RegExp(`${label}\\s+(\\d{2})\\.(\\d{2})\\.(\\d{4})`);

function kindOf(name: string, amount: number): RawLine['kind'] {
	if (/^Pfandtasche/i.test(name)) return amount < 0 ? 'pfand_return' : 'pfand';
	if (/^Liefergeb/i.test(name)) return 'fee';
	if (amount < 0) return 'order_discount';
	return 'item';
}

export function parseReweOnlineLines(rawLines: string[]): ParsedReceipt {
	const lines = rawLines.map((l) => l.trim()).filter(Boolean);
	if (
		!lines.includes('Rechnung') ||
		!lines.some((l) => l.startsWith('REWE Markt GmbH')) ||
		!lines.some((l) => /^Menge\s+MwSt\.\s+Einzelpreis\s+Gesamt$/.test(l))
	)
		throw new UnrecognizedReceipt('not a REWE online invoice');
	const totalLine = lines.find((l) => TOTAL.test(l));
	if (!totalLine) throw new UnrecognizedReceipt('no Gesamtsumme line');

	const out: RawLine[] = [];
	for (const line of lines) {
		const m = ROW.exec(line);
		if (!m) continue;
		const [, name, menge, grams, gesamt] = m;
		const amount = cents(gesamt);
		const kind = kindOf(name, amount);
		if (kind === 'fee' && amount === 0) continue;
		out.push({
			name,
			suggestedName: null,
			qty: grams ? Number(menge) / 1000 : Number(menge),
			unit: grams ? 'kg' : 'pc',
			lineCents: amount,
			kind
		});
	}

	let purchasedAt: string | null = null;
	for (const label of ['Liefertermin', 'Rechnungsdatum', 'Bestelldatum']) {
		const d = lines.map((l) => dateAfter(label).exec(l)).find(Boolean);
		if (d) {
			purchasedAt = `${d[3]}-${d[2]}-${d[1]}T00:00`;
			break;
		}
	}

	return {
		store: REWE_ONLINE_STORE,
		purchasedAt,
		totalCents: cents(TOTAL.exec(totalLine)![1]),
		lines: out
	};
}

export const reweOnlineParser = pdfLinesParser('rewe-online', parseReweOnlineLines);
