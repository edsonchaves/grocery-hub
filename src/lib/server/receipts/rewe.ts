import fs from 'node:fs/promises';
import { extractTextItems } from 'unpdf';
import {
	UnrecognizedReceipt,
	type ParsedReceipt,
	type ParserId,
	type RawLine,
	type ReceiptFile,
	type ReceiptParser
} from './types';

export class NotAReweEbon extends UnrecognizedReceipt {}

export const cents = (s: string) =>
	Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);

/** Rebuilds visual lines: eBon PDFs place name and price as separate text items on one row. */
export async function pdfToLines(data: Uint8Array) {
	const { items } = await extractTextItems(data);
	const lines: string[] = [];
	for (const page of items) {
		const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
		for (const it of page) {
			if (!it.str.trim()) continue;
			const row = rows.find((r) => Math.abs(r.y - it.y) < 2);
			if (row) row.parts.push({ x: it.x, str: it.str });
			else rows.push({ y: it.y, parts: [{ x: it.x, str: it.str }] });
		}
		rows.sort((a, b) => b.y - a.y);
		for (const r of rows) {
			lines.push(
				r.parts
					.sort((a, b) => a.x - b.x)
					.map((p) => p.str.trim())
					.join('  ')
			);
		}
	}
	return lines;
}

const ITEM = /^(.*?\S)\s+(-?\d{1,4},\d{2})\s*(?:[A-Z]{1,2})?\s*\*?$/;
const QTY = /^(\d+)\s*Stk\s*x\s*(-?\d+,\d{2})/i;
const WEIGHT = /^(\d+,\d{1,3})\s*kg\s*x\s*(\d+,\d{2})\s*EUR\s*\/\s*kg/i;
const SUM = /^SUMME\b.*?(-?\d{1,5},\d{2})\s*$/i;
const DATE = /(\d{2})\.(\d{2})\.(\d{2,4})/;
const TIME = /(\d{2}):(\d{2})(?::\d{2})?/;

function kindOf(name: string, amount: number): RawLine['kind'] {
	if (/LEERGUT|PFANDR[ÜU]CK|PFAND\s*R[ÜU]CK|PFANDBON/i.test(name)) return 'pfand_return';
	if (/^PFAND\b/i.test(name)) return amount < 0 ? 'pfand_return' : 'pfand';
	if (amount < 0) return 'discount';
	return 'item';
}

export function parseReweLines(rawLines: string[]): ParsedReceipt {
	const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
	if (!lines.some((l) => /\bREWE\b/i.test(l))) throw new NotAReweEbon('no REWE header');

	const sumIdx = lines.findIndex((l) => SUM.test(l));
	if (sumIdx < 0) throw new NotAReweEbon('no SUMME line');
	const eurIdx = lines.findIndex((l, i) => i < sumIdx && /^EUR$/i.test(l));
	const start = eurIdx >= 0 ? eurIdx + 1 : 0;

	const out: RawLine[] = [];
	for (const line of lines.slice(start, sumIdx)) {
		const prev = out.at(-1);
		const qty = QTY.exec(line);
		if (qty && prev) {
			prev.qty = Number(qty[1]);
			prev.unit = 'pc';
			continue;
		}
		const weight = WEIGHT.exec(line);
		if (weight && prev) {
			prev.qty = Number(weight[1].replace(',', '.'));
			prev.unit = 'kg';
			continue;
		}
		const m = ITEM.exec(line);
		if (!m || /^-+$/.test(line)) continue;
		const amount = cents(m[2]);
		out.push({
			name: m[1],
			suggestedName: null,
			qty: 1,
			unit: null,
			lineCents: amount,
			kind: kindOf(m[1], amount)
		});
	}

	const totalCents = cents(SUM.exec(lines[sumIdx])![1]);

	let purchasedAt: string | null = null;
	const tail = lines.slice(sumIdx);
	const dateLine = tail.find((l) => DATE.test(l));
	const timeLine = tail.find((l) => TIME.test(l) && !/\d,\d{2}/.test(l));
	if (dateLine && timeLine) {
		const [, d, mo, y] = DATE.exec(dateLine)!;
		const [, h, mi] = TIME.exec(dateLine.match(TIME) ? dateLine : timeLine)!;
		const year = y.length === 2 ? `20${y}` : y;
		purchasedAt = `${year}-${mo}-${d}T${h}:${mi}`;
	}

	return { store: 'REWE', purchasedAt, totalCents, lines: out };
}

export function pdfLinesParser(
	id: ParserId,
	parseLines: (lines: string[]) => ParsedReceipt
): ReceiptParser {
	return {
		id,
		async parse(files: ReceiptFile[]) {
			const pdf = files.find((f) => f.mediaType === 'application/pdf');
			if (!pdf) throw new UnrecognizedReceipt('no pdf');
			const lines = await pdfToLines(new Uint8Array(await fs.readFile(pdf.path)));
			return { result: parseLines(lines), raw: lines.join('\n') };
		}
	};
}

export const reweEbonParser = pdfLinesParser('rewe-ebon', parseReweLines);
