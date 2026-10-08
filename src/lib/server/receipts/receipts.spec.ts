import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseReweLines, pdfToLines, reweEbonParser, NotAReweEbon } from './rewe';
import { parseReweOnlineLines, reweOnlineParser } from './rewe-online';
import { toReviewLines, totalsMismatch } from './postprocess';
import { createVisionParser, type VisionClient } from './vision';
import { buildReview, processReceipt, savePurchase } from './service';
import { receipts } from '../db/schema';
import { createProduct } from '../catalog';
import { getStatus } from '../pantry';
import { testHousehold } from '../test/db';
import { textPdf } from '../test/pdf';
import {
	UnrecognizedReceipt,
	type ParsedReceipt,
	type ParserId,
	type ReceiptParser
} from './types';

const readFixture = (name: string) =>
	fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8').split('\n');
const fixture = readFixture('rewe-ebon-synthetic.txt');
const online = readFixture('rewe-online-synthetic.txt');

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
		const lines = await pdfToLines(new Uint8Array(textPdf(fixture)));
		expect(parseReweLines(lines).totalCents).toBe(1208);

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
		const file = path.join(dir, 'receipt.pdf');
		fs.writeFileSync(file, textPdf(fixture));
		const { result } = await reweEbonParser.parse([{ path: file, mediaType: 'application/pdf' }]);
		expect(result.lines).toHaveLength(8);
	});
});

describe('REWE online invoice parser', () => {
	it('parses rows, store, delivery date and total', () => {
		const r = parseReweOnlineLines(online);
		expect(r.store).toBe('REWE online');
		expect(r.purchasedAt).toBe('2026-10-07T00:00');
		expect(r.totalCents).toBe(2987);
		expect(r.lines.map((l) => [l.name, l.kind, l.lineCents])).toEqual([
			['ja! Basmati Reis 1kg', 'item', 747],
			['REWE Beste Wahl Banane ca. 200g', 'item', 74],
			['Weihenstephan H-Milch 3,5% 1l', 'item', 954],
			['Pril Spülmittel Kraft Gel 450ml', 'item', 175],
			['REWE Feine Welt Rumpsteak von der Färse', 'item', 1537],
			['Pfandtasche*', 'pfand', 200],
			['Pfandtasche Rückgabe*', 'pfand_return', -100],
			['Summe Rabatt Gesamtpositionen**', 'order_discount', -600]
		]);
		expect(r.lines[0]).toMatchObject({ qty: 3, unit: 'pc' });
	});

	it('reads weighed items as kg', () => {
		const r = parseReweOnlineLines(online);
		expect(r.lines[1]).toMatchObject({ qty: 0.37, unit: 'kg', lineCents: 74 });
		expect(r.lines[4]).toMatchObject({ qty: 0.308, unit: 'kg' });
	});

	it('reads a multi-page PDF so that only rows sum to the Gesamtsumme', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
		const file = path.join(dir, 'receipt.pdf');
		fs.writeFileSync(file, textPdf(online));
		const { result } = await reweOnlineParser.parse([{ path: file, mediaType: 'application/pdf' }]);
		expect(result.lines).toHaveLength(8);
		expect(result.lines.reduce((s, l) => s + l.lineCents, 0)).toBe(result.totalCents);
	});

	it('keeps a non-zero delivery fee and drops a free one', () => {
		expect(parseReweOnlineLines(online).lines.some((l) => l.kind === 'fee')).toBe(false);
		const paid = parseReweOnlineLines(
			online.map((l) =>
				l.startsWith('Liefergebühr')
					? 'Liefergebühr  1  A/B  3,90 €  3,90 €'
					: l.startsWith('Gesamtsumme')
						? 'Gesamtsumme  33,77 €'
						: l
			)
		);
		expect(paid.lines.find((l) => l.kind === 'fee')).toMatchObject({
			name: 'Liefergebühr',
			lineCents: 390
		});
	});

	it('rejects other formats', () => {
		expect(() => parseReweOnlineLines(fixture)).toThrow(UnrecognizedReceipt);
		expect(() => parseReweLines(online)).toThrow(NotAReweEbon);
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
	const fake = (r: ParsedReceipt, id: ParserId = 'rewe-ebon'): ReceiptParser => ({
		id,
		parse: async () => ({ result: r, raw: '' })
	});
	const rejecting = (id: ParserId, calls: string[] = []): ReceiptParser => ({
		id,
		parse: async () => {
			calls.push(id);
			throw new UnrecognizedReceipt(`not ${id}`);
		}
	});
	const receiptRow = (db: Awaited<ReturnType<typeof testHousehold>>['db'], id: number) =>
		db
			.select()
			.from(receipts)
			.all()
			.find((x) => x.id === id)!;

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

	it('tries PDF parsers in order and records the one that matched', async () => {
		const { db, hh } = await testHousehold();
		const calls: string[] = [];
		const record = (p: ReceiptParser): ReceiptParser => ({
			id: p.id,
			parse: async (files) => (calls.push(p.id), p.parse(files))
		});
		const parsers = {
			pdf: [rejecting('rewe-ebon', calls), record(fake(parsed, 'rewe-online'))],
			vision: record(fake(parsed, 'vision'))
		};
		const pdf = await parsedReceipt(db, hh, 'pdf', parsers);
		const photo = await parsedReceipt(db, hh, 'photo', parsers);
		expect(calls).toEqual(['rewe-ebon', 'rewe-online', 'vision']);
		expect(receiptRow(db, pdf).parser).toBe('rewe-online');
		expect(receiptRow(db, photo).parser).toBe('vision');
	});

	it('logs why each PDF parser rejected before falling back to the LLM', async () => {
		const { db, hh } = await testHousehold();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const id = await parsedReceipt(db, hh, 'pdf', {
			pdf: [rejecting('rewe-ebon'), rejecting('rewe-online')],
			vision: fake(parsed, 'vision')
		});
		expect(warn).toHaveBeenCalledWith(
			`receipt ${id}: no PDF parser matched (rewe-ebon: not rewe-ebon; rewe-online: not rewe-online)`
		);
		warn.mockRestore();
		expect(receiptRow(db, id)).toMatchObject({ status: 'parsed', parser: 'vision' });
	});

	it('learns aliases, restocks pantry, and warns on duplicates', async () => {
		const { db, admin, hh } = await testHousehold();
		const milch = createProduct(db, hh, { name: 'Milch' });

		const first = await parsedReceipt(db, hh, 'pdf', { pdf: [fake(parsed)], vision: null });
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

		const second = await parsedReceipt(db, hh, 'pdf', { pdf: [fake(parsed)], vision: null });
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
		const id = await parsedReceipt(db, hh, 'photo', { pdf: [fake(parsed)], vision: null });
		expect(receiptRow(db, id)).toMatchObject({ status: 'failed', error: 'noApiKey' });
	});
});
