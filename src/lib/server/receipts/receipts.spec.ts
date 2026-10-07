import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseReweLines, pdfToLines, reweEbonParser, NotAReweEbon } from './rewe';
import { toReviewLines, totalsMismatch } from './postprocess';
import { createVisionParser, type VisionClient } from './vision';
import { buildReview, processReceipt, savePurchase } from './service';
import { receipts } from '../db/schema';
import { createProduct } from '../catalog';
import { getStatus } from '../pantry';
import { testHousehold } from '../test/db';
import type { ParsedReceipt, ReceiptParser } from './types';

const fixture = fs
	.readFileSync(path.join(import.meta.dirname, 'fixtures/rewe-ebon-synthetic.txt'), 'utf8')
	.split('\n');

/** Minimal PDF with each fixture line laid out like an eBon: name left, amount right-aligned. */
function ebonPdf(lines: string[]) {
	const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
	const ops: string[] = [];
	lines.forEach((line, i) => {
		const y = 800 - i * 12;
		const [left, ...right] = line.split(/\s{2,}/);
		ops.push(`BT /F1 9 Tf 20 ${y} Td (${esc(left)}) Tj ET`);
		if (right.length) ops.push(`BT /F1 9 Tf 200 ${y} Td (${esc(right.join(' '))}) Tj ET`);
	});
	const stream = ops.join('\n');
	const objs = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
	];
	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(Buffer.byteLength(pdf, 'latin1'));
		pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = Buffer.byteLength(pdf, 'latin1');
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
	pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return Buffer.from(pdf, 'latin1');
}

describe('REWE eBon parser', () => {
	it('parses items, quantities, weights, Pfand, discounts, total and date', () => {
		const r = parseReweLines(fixture);
		expect(r.store).toBe('REWE');
		expect(r.totalCents).toBe(1208);
		expect(r.purchasedAt).toBe('2026-10-07T18:32');
		expect(r.lines.map((l) => [l.name, l.kind, l.lineCents])).toEqual([
			['BIO VOLLMILCH 3,8%', 'item', 129],
			['JA! TOASTBROT', 'item', 238],
			['BANANE CHIQUITA', 'item', 173],
			['MINERALWASSER 1,5L', 'item', 49],
			['PFAND 0,25 EURO', 'pfand', 25],
			['PREISVORTEIL', 'discount', -30],
			['LEERGUT', 'pfand_return', -75],
			['KAFFEE CREMA', 'item', 699]
		]);
		expect(r.lines[1]).toMatchObject({ qty: 2, unit: 'pc' });
		expect(r.lines[2]).toMatchObject({ qty: 1.234, unit: 'kg' });
	});

	it('rejects non-REWE text', () => {
		expect(() => parseReweLines(['LIDL', 'SUMME 1,00'])).toThrow(NotAReweEbon);
	});

	it('reads the eBon PDF without the LLM', async () => {
		const lines = await pdfToLines(new Uint8Array(ebonPdf(fixture)));
		expect(parseReweLines(lines).totalCents).toBe(1208);

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
		const file = path.join(dir, 'receipt.pdf');
		fs.writeFileSync(file, ebonPdf(fixture));
		const { result } = await reweEbonParser.parse([{ path: file, mediaType: 'application/pdf' }]);
		expect(result.lines).toHaveLength(8);
	});
});

describe('post-processing', () => {
	it('attaches discounts to the preceding item and keeps Pfand separate', () => {
		const lines = toReviewLines(parseReweLines(fixture));
		// PREISVORTEIL comes after the bottle's Pfand line but belongs to the bottle
		const water = lines.find((l) => l.rawName === 'MINERALWASSER 1,5L');
		expect(water?.discountCents).toBe(-30);
		expect(lines.some((l) => l.rawName === 'PREISVORTEIL')).toBe(false);
		const pfand = lines.filter((l) => l.kind === 'pfand');
		expect(pfand.map((l) => l.lineCents)).toEqual([25, -75]);
	});

	it('warns on totals mismatch above 0.05 EUR', () => {
		const lines = toReviewLines(parseReweLines(fixture));
		expect(totalsMismatch(lines, 1208)).toBeUndefined();
		expect(totalsMismatch(lines, 1212)).toBeUndefined();
		expect(totalsMismatch(lines, 1300)).toEqual({ sum: 1208, total: 1300, diff: -92 });
	});
});

describe('vision parser', () => {
	it('sends images and maps the structured output', async () => {
		// recorded response shape from the Messages API (parsed_output already validated by the SDK)
		const recorded = {
			stop_reason: 'end_turn',
			parsed_output: {
				store: 'Lidl',
				purchased_at: '2026-10-05T09:14',
				total_cents: 348,
				lines: [
					{
						name: 'H-MILCH 1,5%',
						suggested_name: 'Milch',
						qty: 2,
						unit: 'pc',
						line_cents: 198,
						kind: 'item'
					},
					{
						name: 'BUTTER',
						suggested_name: 'Butter',
						qty: 1,
						unit: 'pc',
						line_cents: 199,
						kind: 'item'
					},
					{
						name: 'Rabatt',
						suggested_name: null,
						qty: 1,
						unit: null,
						line_cents: -49,
						kind: 'discount'
					}
				]
			}
		};
		let request: { model: string; messages: { content: { type: string }[] }[] } | undefined;
		const client = {
			beta: {
				messages: {
					parse: async (params: typeof request) => {
						request = params;
						return recorded;
					}
				}
			}
		} as unknown as VisionClient;

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
		const file = path.join(dir, '1.jpg');
		fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff]));
		const { result } = await createVisionParser(client, 'test-model').parse([
			{ path: file, mediaType: 'image/jpeg' }
		]);

		expect(request?.model).toBe('test-model');
		expect(request?.messages[0].content.map((c) => c.type)).toEqual(['image', 'text']);
		expect(result).toMatchObject({
			store: 'Lidl',
			purchasedAt: '2026-10-05T09:14',
			totalCents: 348
		});
		expect(result.lines[0]).toMatchObject({ name: 'H-MILCH 1,5%', suggestedName: 'Milch', qty: 2 });
	});
});

describe('import flow', () => {
	const parsed: ParsedReceipt = {
		store: 'REWE',
		purchasedAt: '2026-10-07T18:32',
		totalCents: 129,
		lines: [
			{
				name: 'BIO VOLLMILCH 3,8%',
				suggestedName: null,
				qty: 1,
				unit: null,
				lineCents: 129,
				kind: 'item'
			}
		]
	};
	const fake = (r: ParsedReceipt): ReceiptParser => ({
		parse: async () => ({ result: r, raw: '' })
	});

	async function parsedReceipt(
		db: Awaited<ReturnType<typeof testHousehold>>['db'],
		hh: number,
		kind: 'pdf' | 'photo',
		parsers: Parameters<typeof processReceipt>[2]
	) {
		const r = db.insert(receipts).values({ householdId: hh, kind, files: [] }).returning().get();
		await processReceipt(db, r.id, parsers);
		return r.id;
	}

	it('uses the eBon parser for PDFs and the LLM for photos', async () => {
		const { db, hh } = await testHousehold();
		const calls: string[] = [];
		const parsers = {
			ebon: { parse: async () => (calls.push('ebon'), { result: parsed, raw: '' }) },
			vision: { parse: async () => (calls.push('vision'), { result: parsed, raw: '' }) }
		};
		await parsedReceipt(db, hh, 'pdf', parsers);
		await parsedReceipt(db, hh, 'photo', parsers);
		expect(calls).toEqual(['ebon', 'vision']);
	});

	it('learns aliases, restocks pantry, and warns on duplicates', async () => {
		const { db, admin, hh } = await testHousehold();
		const milch = createProduct(db, hh, { name: 'Milch' });

		const first = await parsedReceipt(db, hh, 'pdf', { ebon: fake(parsed), vision: null });
		const review = buildReview(db, hh, first)!;
		expect(review.lines[0].match?.auto).toBe(false);
		expect(review.lines[0].match?.productId).toBe(milch.id);

		const save = (force = false) =>
			savePurchase(
				db,
				hh,
				admin.id,
				{
					store: review.store,
					purchasedAt: review.purchasedAt,
					totalCents: 129,
					force,
					lines: [{ rawName: 'BIO VOLLMILCH 3,8%', productId: milch.id, lineCents: 129 }]
				},
				first
			);
		expect(save().duplicate).toBe(false);
		expect(getStatus(db, milch.id)).toMatchObject({ status: 'in_stock' });
		expect(getStatus(db, milch.id)?.lastRestockAt?.getTime()).toBe(
			new Date('2026-10-07T18:32').getTime()
		);

		const second = await parsedReceipt(db, hh, 'pdf', { ebon: fake(parsed), vision: null });
		const again = buildReview(db, hh, second)!;
		expect(again.lines[0].match).toMatchObject({ productId: milch.id, auto: true });
		expect(again.duplicate).toBe(true);
		expect(save().duplicate).toBe(true);
		expect(save(true).duplicate).toBe(false);
	});

	it('records a manual purchase with only a total', async () => {
		const { db, admin, hh } = await testHousehold();
		const r = savePurchase(db, hh, admin.id, {
			store: 'Wochenmarkt',
			purchasedAt: '2026-10-03',
			totalCents: 1200
		});
		expect(r.duplicate).toBe(false);
	});

	it('fails cleanly without an API key for photos', async () => {
		const { db, hh } = await testHousehold();
		const id = await parsedReceipt(db, hh, 'photo', { ebon: fake(parsed), vision: null });
		const r = db
			.select()
			.from(receipts)
			.all()
			.find((x) => x.id === id)!;
		expect(r).toMatchObject({ status: 'failed', error: 'noApiKey' });
	});
});
