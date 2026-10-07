import { and, asc, eq, max, sql } from 'drizzle-orm';
import type { Db } from './db';
import {
	categories,
	listItems,
	pantryStatus,
	productAliases,
	products,
	purchaseLines,
	suggestionDismissals
} from './db/schema';
import type { Locale } from '../i18n/locales';

const DEFAULT_CATEGORIES: Record<Locale, string[]> = {
	pt: [
		'Hortifruti',
		'Padaria',
		'Laticínios',
		'Carnes',
		'Congelados',
		'Bebidas',
		'Casa',
		'Drogaria'
	],
	de: [
		'Obst & Gemüse',
		'Backwaren',
		'Molkerei',
		'Fleisch',
		'Tiefkühl',
		'Getränke',
		'Haushalt',
		'Drogerie'
	],
	en: ['Produce', 'Bakery', 'Dairy', 'Meat', 'Frozen', 'Drinks', 'Household', 'Drugstore']
};

export function seedDefaultCategories(db: Db, householdId: number, locale: Locale = 'pt') {
	db.insert(categories)
		.values(DEFAULT_CATEGORIES[locale].map((name, i) => ({ householdId, name, sortOrder: i })))
		.run();
}

// ---- name normalization and similarity ----

/** Key for receipt aliases: uppercase, without sizes/percentages that vary between prints. */
export function normalizeReceiptName(raw: string) {
	return raw
		.toUpperCase()
		.replace(/\d+([.,]\d+)?\s*%/g, ' ')
		.replace(/\b\d+([.,]\d+)?\s*(X\s*\d+([.,]\d+)?\s*)?(G|GR|KG|ML|CL|L|LTR|STK|ST|ER)\b/g, ' ')
		.replace(/[^\p{L}\p{N}&]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function searchKey(s: string) {
	return s
		.toLowerCase()
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function trigrams(s: string) {
	const out = new Set<string>();
	for (const word of searchKey(s).split(' ').filter(Boolean)) {
		const w = `  ${word} `;
		for (let i = 0; i < w.length - 2; i++) out.add(w.slice(i, i + 3));
	}
	return out;
}

/** Jaccard similarity, or how much of `candidate` is contained in `query` if that is higher
 * (so "BIO VOLLMILCH" still ranks "Milch" well). */
export function similarity(query: string, candidate: string) {
	const a = trigrams(query);
	const b = trigrams(candidate);
	if (!a.size || !b.size) return 0;
	let common = 0;
	for (const g of b) if (a.has(g)) common++;
	const jaccard = common / (a.size + b.size - common);
	const contained = common / b.size;
	return Math.max(jaccard, contained * 0.9);
}

export type ProductRow = {
	id: number;
	name: string;
	categoryId: number | null;
	unit: string | null;
	ean: string | null;
};

export function rankProducts<T extends { name: string }>(query: string, items: T[], limit = 5) {
	const q = searchKey(query);
	if (!q) return [];
	return items
		.map((item) => {
			const name = searchKey(item.name);
			let score = similarity(query, item.name);
			if (name === q) score = 2;
			else if (name.startsWith(q)) score += 0.5;
			else if (name.includes(q)) score += 0.3;
			return { item, score };
		})
		.filter((r) => r.score >= 0.3)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

// ---- products ----

export function listProducts(db: Db, householdId: number) {
	return db
		.select({
			id: products.id,
			name: products.name,
			categoryId: products.categoryId,
			unit: products.unit,
			ean: products.ean,
			categoryName: categories.name
		})
		.from(products)
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.where(eq(products.householdId, householdId))
		.orderBy(asc(sql`lower(${products.name})`))
		.all();
}

export function getProduct(db: Db, householdId: number, id: number) {
	return db
		.select()
		.from(products)
		.where(and(eq(products.id, id), eq(products.householdId, householdId)))
		.get();
}

export function searchProducts(db: Db, householdId: number, query: string, limit = 8) {
	return rankProducts(query, listProducts(db, householdId), limit).map((r) => r.item);
}

export type ProductInput = {
	name: string;
	categoryId?: number | null;
	unit?: string | null;
	ean?: string | null;
};

function clean(input: Partial<ProductInput>) {
	const out: Partial<ProductInput> = {};
	if (input.name !== undefined) out.name = input.name.trim();
	if (input.categoryId !== undefined) out.categoryId = input.categoryId || null;
	if (input.unit !== undefined) out.unit = input.unit?.trim() || null;
	if (input.ean !== undefined) out.ean = input.ean?.trim() || null;
	return out;
}

export function createProduct(db: Db, householdId: number, input: ProductInput) {
	const values = clean(input);
	if (!values.name) throw new Error('name required');
	return db
		.insert(products)
		.values({ ...values, name: values.name, householdId })
		.returning()
		.get();
}

export function findProductByName(db: Db, householdId: number, name: string) {
	return db
		.select()
		.from(products)
		.where(
			and(
				eq(products.householdId, householdId),
				sql`lower(${products.name}) = lower(${name.trim()})`
			)
		)
		.get();
}

export function findOrCreateProduct(db: Db, householdId: number, name: string) {
	return findProductByName(db, householdId, name) ?? createProduct(db, householdId, { name });
}

export function updateProduct(
	db: Db,
	householdId: number,
	id: number,
	input: Partial<ProductInput>
) {
	const values = clean(input);
	if (values.name === '') throw new Error('name required');
	return db
		.update(products)
		.set(values)
		.where(and(eq(products.id, id), eq(products.householdId, householdId)))
		.returning()
		.get();
}

export function deleteProduct(db: Db, householdId: number, id: number) {
	db.delete(products)
		.where(and(eq(products.id, id), eq(products.householdId, householdId)))
		.run();
}

/** Moves everything that references `sourceId` to `targetId`, then deletes the source. */
export function mergeProducts(db: Db, householdId: number, sourceId: number, targetId: number) {
	if (sourceId === targetId) return;
	db.transaction((tx) => {
		const source = getProduct(tx, householdId, sourceId);
		const target = getProduct(tx, householdId, targetId);
		if (!source || !target) throw new Error('product not found');

		const targetAliases = tx
			.select({ storeId: productAliases.storeId, n: productAliases.normalizedName })
			.from(productAliases)
			.where(eq(productAliases.productId, targetId))
			.all();
		const taken = new Set(targetAliases.map((a) => `${a.storeId}|${a.n}`));
		for (const a of tx
			.select()
			.from(productAliases)
			.where(eq(productAliases.productId, sourceId))
			.all()) {
			if (taken.has(`${a.storeId}|${a.normalizedName}`)) {
				tx.delete(productAliases).where(eq(productAliases.id, a.id)).run();
			} else {
				tx.update(productAliases)
					.set({ productId: targetId })
					.where(eq(productAliases.id, a.id))
					.run();
			}
		}

		tx.update(purchaseLines)
			.set({ productId: targetId })
			.where(eq(purchaseLines.productId, sourceId))
			.run();

		const targetOpen = tx
			.select({ id: listItems.id })
			.from(listItems)
			.where(and(eq(listItems.productId, targetId), eq(listItems.checked, false)))
			.get();
		if (targetOpen) {
			tx.delete(listItems)
				.where(and(eq(listItems.productId, sourceId), eq(listItems.checked, false)))
				.run();
		}
		tx.update(listItems)
			.set({ productId: targetId })
			.where(eq(listItems.productId, sourceId))
			.run();

		const sp = tx.select().from(pantryStatus).where(eq(pantryStatus.productId, sourceId)).get();
		const tp = tx.select().from(pantryStatus).where(eq(pantryStatus.productId, targetId)).get();
		if (sp && (!tp || sp.updatedAt > tp.updatedAt)) {
			tx.delete(pantryStatus).where(eq(pantryStatus.productId, targetId)).run();
			tx.update(pantryStatus)
				.set({
					productId: targetId,
					lastRestockAt: maxDate(sp.lastRestockAt, tp?.lastRestockAt)
				})
				.where(eq(pantryStatus.productId, sourceId))
				.run();
		}

		tx.delete(suggestionDismissals).where(eq(suggestionDismissals.productId, sourceId)).run();
		tx.update(products)
			.set({
				categoryId: target.categoryId ?? source.categoryId,
				unit: target.unit ?? source.unit,
				ean: target.ean ?? source.ean
			})
			.where(eq(products.id, targetId))
			.run();
		tx.delete(products).where(eq(products.id, sourceId)).run();
	});
}

function maxDate(a: Date | null, b: Date | null | undefined) {
	if (!a) return b ?? null;
	if (!b) return a;
	return a > b ? a : b;
}

// ---- categories ----

export function listCategories(db: Db, householdId: number) {
	return db
		.select()
		.from(categories)
		.where(eq(categories.householdId, householdId))
		.orderBy(asc(categories.sortOrder), asc(categories.id))
		.all();
}

export function createCategory(db: Db, householdId: number, name: string) {
	if (!name.trim()) throw new Error('name required');
	const top = db
		.select({ m: max(categories.sortOrder) })
		.from(categories)
		.where(eq(categories.householdId, householdId))
		.get();
	return db
		.insert(categories)
		.values({ householdId, name: name.trim(), sortOrder: (top?.m ?? -1) + 1 })
		.returning()
		.get();
}

export function renameCategory(db: Db, householdId: number, id: number, name: string) {
	if (!name.trim()) throw new Error('name required');
	db.update(categories)
		.set({ name: name.trim() })
		.where(and(eq(categories.id, id), eq(categories.householdId, householdId)))
		.run();
}

export function moveCategory(db: Db, householdId: number, id: number, dir: -1 | 1) {
	db.transaction((tx) => {
		const all = listCategories(tx, householdId);
		const i = all.findIndex((c) => c.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= all.length) return;
		[all[i], all[j]] = [all[j], all[i]];
		all.forEach((c, idx) =>
			tx.update(categories).set({ sortOrder: idx }).where(eq(categories.id, c.id)).run()
		);
	});
}

export function deleteCategory(db: Db, householdId: number, id: number) {
	// products.category_id is ON DELETE SET NULL → products become uncategorized
	db.delete(categories)
		.where(and(eq(categories.id, id), eq(categories.householdId, householdId)))
		.run();
}
