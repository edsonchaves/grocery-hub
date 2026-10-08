import fs from 'node:fs/promises';
import path from 'node:path';
import convertHeic from 'heic-convert';
import sharp from 'sharp';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db';
import { purchaseLines, purchases, receipts, stores } from '../db/schema';
import { config } from '../config';
import { findOrCreateProduct, listProducts } from '../catalog';
import { markRestocked } from '../pantry';
import { matchLine, saveAlias, type Match } from './matching';
import { toReviewLines, totalsMismatch } from './postprocess';
import { reweEbonParser } from './rewe';
import { reweOnlineParser } from './rewe-online';
import { createVisionParser } from './vision';
import {
	UNITS,
	UnrecognizedReceipt,
	parsedReceiptSchema,
	type ParserId,
	type ReceiptFile,
	type ReceiptParser,
	type ReviewLine
} from './types';

export const receiptsDir = () => path.join(config.dataDir, 'receipts');

// ---- stores ----

export function findStore(db: Db, householdId: number, name: string) {
	return db
		.select()
		.from(stores)
		.where(
			and(eq(stores.householdId, householdId), sql`lower(${stores.name}) = lower(${name.trim()})`)
		)
		.get();
}

export function findOrCreateStore(db: Db, householdId: number, name: string) {
	return (
		findStore(db, householdId, name) ??
		db.insert(stores).values({ householdId, name: name.trim() }).returning().get()
	);
}

export function listStores(db: Db, householdId: number) {
	return db
		.select()
		.from(stores)
		.where(eq(stores.householdId, householdId))
		.orderBy(stores.name)
		.all();
}

// ---- upload ----

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isHeic = (f: File) => /image\/hei[cf]/.test(f.type) || /\.hei[cf]$/i.test(f.name);

async function toJpeg(f: File) {
	let input = Buffer.from(await f.arrayBuffer());
	if (isHeic(f))
		input = Buffer.from(await convertHeic({ buffer: input, format: 'JPEG', quality: 0.9 }));
	// downscale: enough for reading text, keeps storage and LLM tokens small
	return sharp(input)
		.rotate()
		.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();
}

export async function storeUpload(db: Db, householdId: number, userId: number, files: File[]) {
	files = files.filter((f) => f.size > 0);
	if (!files.length) throw new Error('no files');
	const pdf = files.find(isPdf);
	const kind = pdf ? 'pdf' : 'photo';
	const receipt = db
		.insert(receipts)
		.values({ householdId, uploadedBy: userId, kind, files: [] })
		.returning()
		.get();
	const dir = path.join(receiptsDir(), String(receipt.id));
	await fs.mkdir(dir, { recursive: true });
	const names: string[] = [];
	if (pdf) {
		await fs.writeFile(path.join(dir, 'receipt.pdf'), Buffer.from(await pdf.arrayBuffer()));
		names.push('receipt.pdf');
	} else {
		for (const [i, f] of files.entries()) {
			const name = `${i + 1}.jpg`;
			await fs.writeFile(path.join(dir, name), await toJpeg(f));
			names.push(name);
		}
	}
	db.update(receipts).set({ files: names }).where(eq(receipts.id, receipt.id)).run();
	return receipt.id;
}

export function receiptFiles(receiptId: number, names: string[]): ReceiptFile[] {
	return names.map((n) => ({
		path: path.join(receiptsDir(), String(receiptId), n),
		mediaType: n.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
	}));
}

// ---- parsing ----

export type Parsers = { pdf: ReceiptParser[]; vision: ReceiptParser | null };

export const defaultParsers = (): Parsers => ({
	pdf: [reweEbonParser, reweOnlineParser],
	vision: config.anthropicApiKey ? createVisionParser() : null
});

export async function processReceipt(
	db: Db,
	receiptId: number,
	parsers: Parsers = defaultParsers()
) {
	const r = db.select().from(receipts).where(eq(receipts.id, receiptId)).get();
	if (!r || r.status === 'confirmed') return;
	db.update(receipts)
		.set({ status: 'pending', error: null, parser: null })
		.where(eq(receipts.id, receiptId))
		.run();
	const files = receiptFiles(r.id, r.files);
	try {
		let out: Awaited<ReturnType<ReceiptParser['parse']>> | undefined;
		let parser: ParserId | undefined;
		if (r.kind === 'pdf') {
			const misses: string[] = [];
			for (const p of parsers.pdf) {
				try {
					const res = await p.parse(files);
					if (res.result.lines.length) {
						[out, parser] = [res, p.id];
						break;
					}
					misses.push(`${p.id}: no lines`);
				} catch (e) {
					if (!(e instanceof UnrecognizedReceipt)) console.error(`${p.id} parser crashed`, e);
					misses.push(`${p.id}: ${e instanceof Error ? e.message : e}`);
				}
			}
			if (!out) console.warn(`receipt ${r.id}: no PDF parser matched (${misses.join('; ')})`);
		}
		if (!out) {
			if (!parsers.vision) throw new Error('noApiKey');
			out = await parsers.vision.parse(files);
			parser = parsers.vision.id;
		}
		db.update(receipts)
			.set({ status: 'parsed', parsed: out.result, rawOutput: out.raw, parser })
			.where(eq(receipts.id, receiptId))
			.run();
	} catch (e) {
		db.update(receipts)
			.set({ status: 'failed', error: e instanceof Error ? e.message : String(e) })
			.where(eq(receipts.id, receiptId))
			.run();
	}
}

export function getReceipt(db: Db, householdId: number, id: number) {
	return db
		.select()
		.from(receipts)
		.where(and(eq(receipts.id, id), eq(receipts.householdId, householdId)))
		.get();
}

export function listReceipts(db: Db, householdId: number, limit = 30) {
	return db
		.select({
			id: receipts.id,
			kind: receipts.kind,
			status: receipts.status,
			createdAt: receipts.createdAt,
			totalCents: purchases.totalCents,
			storeName: stores.name
		})
		.from(receipts)
		.leftJoin(purchases, eq(purchases.receiptId, receipts.id))
		.leftJoin(stores, eq(stores.id, purchases.storeId))
		.where(eq(receipts.householdId, householdId))
		.orderBy(desc(receipts.id))
		.limit(limit)
		.all();
}

// ---- review ----

export type ReviewData = {
	store: string;
	purchasedAt: string;
	totalCents: number | null;
	lines: (ReviewLine & { match: Match | null })[];
	mismatch: ReturnType<typeof totalsMismatch>;
	duplicate: boolean;
};

const localIso = (d: Date) => {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function buildReview(
	db: Db,
	householdId: number,
	receiptId: number
): ReviewData | undefined {
	const r = getReceipt(db, householdId, receiptId);
	if (!r?.parsed) return undefined;
	const parsed = parsedReceiptSchema.parse(r.parsed);
	const lines = toReviewLines(parsed);
	const store = parsed.store ?? '';
	const storeRow = store ? findStore(db, householdId, store) : undefined;
	const catalog = listProducts(db, householdId);
	const purchasedAt = parsed.purchasedAt ?? localIso(r.createdAt);
	return {
		store,
		purchasedAt,
		totalCents: parsed.totalCents,
		lines: lines.map((l) => ({
			...l,
			match: l.kind === 'item' ? matchLine(db, householdId, storeRow?.id, l, catalog) : null
		})),
		mismatch: totalsMismatch(lines, parsed.totalCents),
		duplicate:
			!!storeRow &&
			parsed.totalCents != null &&
			isDuplicate(db, householdId, storeRow.id, new Date(purchasedAt), parsed.totalCents)
	};
}

function isDuplicate(db: Db, householdId: number, storeId: number, at: Date, totalCents: number) {
	return !!db
		.select({ id: purchases.id })
		.from(purchases)
		.where(
			and(
				eq(purchases.householdId, householdId),
				eq(purchases.storeId, storeId),
				eq(purchases.purchasedAt, at),
				eq(purchases.totalCents, totalCents)
			)
		)
		.get();
}

// ---- saving ----

export const purchaseInputSchema = z.object({
	store: z.string().trim().min(1),
	purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/),
	totalCents: z.number().int(),
	force: z.boolean().default(false),
	lines: z
		.array(
			z.object({
				rawName: z.string().trim().min(1),
				productId: z.number().int().nullable().default(null),
				newProductName: z.string().trim().nullable().default(null),
				qty: z.number().positive().default(1),
				unit: z.enum(UNITS).nullable().default(null),
				lineCents: z.number().int(),
				discountCents: z.number().int().max(0).default(0),
				kind: z.enum(['item', 'pfand']).default('item')
			})
		)
		.default([])
});
export type PurchaseInput = z.input<typeof purchaseInputSchema>;

export function savePurchase(
	db: Db,
	householdId: number,
	userId: number | null,
	rawInput: PurchaseInput,
	receiptId?: number
): { duplicate: true } | { duplicate: false; purchaseId: number } {
	const input = purchaseInputSchema.parse(rawInput);
	const at = new Date(
		input.purchasedAt.length === 10 ? `${input.purchasedAt}T12:00` : input.purchasedAt
	);
	return db.transaction((tx) => {
		const store = findOrCreateStore(tx, householdId, input.store);
		if (!input.force && isDuplicate(tx, householdId, store.id, at, input.totalCents)) {
			return { duplicate: true as const };
		}
		const purchase = tx
			.insert(purchases)
			.values({
				householdId,
				storeId: store.id,
				purchasedAt: at,
				totalCents: input.totalCents,
				receiptId: receiptId ?? null,
				createdBy: userId
			})
			.returning()
			.get();
		const restocked = new Set<number>();
		for (const l of input.lines) {
			let productId: number | null = null;
			if (l.kind === 'item') {
				if (l.newProductName) productId = findOrCreateProduct(tx, householdId, l.newProductName).id;
				else if (l.productId) productId = l.productId;
			}
			tx.insert(purchaseLines)
				.values({
					purchaseId: purchase.id,
					productId,
					kind: l.kind,
					rawName: l.rawName,
					qty: l.qty,
					unit: l.unit,
					lineCents: l.lineCents,
					discountCents: l.discountCents
				})
				.run();
			if (productId) {
				if (receiptId) saveAlias(tx, householdId, store.id, l.rawName, productId);
				restocked.add(productId);
			}
		}
		for (const id of restocked) markRestocked(tx, householdId, id, at.getTime());
		if (receiptId) {
			tx.update(receipts).set({ status: 'confirmed' }).where(eq(receipts.id, receiptId)).run();
		}
		return { duplicate: false as const, purchaseId: purchase.id };
	});
}

export function listPurchases(db: Db, householdId: number, limit = 50) {
	return db
		.select({
			id: purchases.id,
			purchasedAt: purchases.purchasedAt,
			totalCents: purchases.totalCents,
			storeName: stores.name,
			receiptId: purchases.receiptId
		})
		.from(purchases)
		.innerJoin(stores, eq(stores.id, purchases.storeId))
		.where(eq(purchases.householdId, householdId))
		.orderBy(desc(purchases.purchasedAt))
		.limit(limit)
		.all();
}

export function deletePurchase(db: Db, householdId: number, id: number) {
	db.transaction((tx) => {
		const p = tx
			.delete(purchases)
			.where(and(eq(purchases.id, id), eq(purchases.householdId, householdId)))
			.returning()
			.get();
		if (p?.receiptId) {
			tx.update(receipts).set({ status: 'parsed' }).where(eq(receipts.id, p.receiptId)).run();
		}
	});
}
