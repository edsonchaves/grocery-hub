import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './db';
import { categories, listItems, products } from './db/schema';
import { findOrCreateProduct, getProduct } from './catalog';
import { publish } from './events';
import { markRestocked } from './pantry';
import type { ListItemView } from '../types';

export function listView(db: Db, householdId: number, ids?: number[]): ListItemView[] {
	const rows = db
		.select({
			id: listItems.id,
			productId: listItems.productId,
			text: listItems.text,
			productName: products.name,
			qty: listItems.qty,
			note: listItems.note,
			checked: listItems.checked,
			checkedAt: listItems.checkedAt,
			createdAt: listItems.createdAt,
			categoryId: categories.id,
			categoryName: categories.name,
			categoryOrder: categories.sortOrder
		})
		.from(listItems)
		.leftJoin(products, eq(products.id, listItems.productId))
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.where(
			ids
				? and(eq(listItems.householdId, householdId), inArray(listItems.id, ids))
				: eq(listItems.householdId, householdId)
		)
		.all();
	return rows.map((r) => ({
		id: r.id,
		productId: r.productId,
		name: r.productName ?? r.text ?? '',
		qty: r.qty,
		note: r.note,
		checked: r.checked,
		checkedAt: r.checkedAt?.getTime() ?? null,
		createdAt: r.createdAt.getTime(),
		categoryId: r.categoryId,
		categoryName: r.categoryName,
		categoryOrder: r.categoryOrder
	}));
}

function broadcast(db: Db, householdId: number, ids: number[]) {
	if (ids.length) publish(householdId, { type: 'upsert', items: listView(db, householdId, ids) });
}

export function openItemForProduct(db: Db, householdId: number, productId: number) {
	return db
		.select()
		.from(listItems)
		.where(
			and(
				eq(listItems.householdId, householdId),
				eq(listItems.productId, productId),
				eq(listItems.checked, false)
			)
		)
		.get();
}

export type AddInput = { productId?: number; text?: string; qty?: string; note?: string };

/** Adds an entry; free text becomes a new uncategorized product so it can be learned. */
export function addItem(db: Db, householdId: number, userId: number | null, input: AddInput) {
	const result = db.transaction((tx) => {
		let productId = input.productId;
		if (productId) {
			if (!getProduct(tx, householdId, productId)) throw new Error('product not found');
		} else {
			const text = input.text?.trim();
			if (!text) throw new Error('text required');
			productId = findOrCreateProduct(tx, householdId, text).id;
		}
		const existing = openItemForProduct(tx, householdId, productId);
		if (existing) return { id: existing.id, duplicate: true };
		const row = tx
			.insert(listItems)
			.values({
				householdId,
				productId,
				qty: input.qty?.trim() || null,
				note: input.note?.trim() || null,
				createdBy: userId
			})
			.returning()
			.get();
		return { id: row.id, duplicate: false };
	});
	if (!result.duplicate) broadcast(db, householdId, [result.id]);
	return { item: listView(db, householdId, [result.id])[0], duplicate: result.duplicate };
}

export function updateItem(
	db: Db,
	householdId: number,
	id: number,
	input: { qty?: string | null; note?: string | null }
) {
	const set: { qty?: string | null; note?: string | null } = {};
	if (input.qty !== undefined) set.qty = input.qty?.trim() || null;
	if (input.note !== undefined) set.note = input.note?.trim() || null;
	db.update(listItems)
		.set(set)
		.where(and(eq(listItems.id, id), eq(listItems.householdId, householdId)))
		.run();
	broadcast(db, householdId, [id]);
}

export function setChecked(
	db: Db,
	householdId: number,
	id: number,
	checked: boolean,
	now = Date.now()
) {
	const item = db
		.update(listItems)
		.set({ checked, checkedAt: checked ? new Date(now) : null })
		.where(and(eq(listItems.id, id), eq(listItems.householdId, householdId)))
		.returning()
		.get();
	if (!item) return;
	if (checked && item.productId) markRestocked(db, householdId, item.productId, now);
	broadcast(db, householdId, [id]);
}

export function removeItem(db: Db, householdId: number, id: number) {
	db.delete(listItems)
		.where(and(eq(listItems.id, id), eq(listItems.householdId, householdId)))
		.run();
	publish(householdId, { type: 'remove', ids: [id] });
}

export function clearChecked(db: Db, householdId: number) {
	const removed = db
		.delete(listItems)
		.where(and(eq(listItems.householdId, householdId), eq(listItems.checked, true)))
		.returning({ id: listItems.id })
		.all();
	if (removed.length) publish(householdId, { type: 'remove', ids: removed.map((r) => r.id) });
}

export function openProductIds(db: Db, householdId: number) {
	return new Set(
		db
			.select({ productId: listItems.productId })
			.from(listItems)
			.where(
				and(
					eq(listItems.householdId, householdId),
					eq(listItems.checked, false),
					sql`${listItems.productId} is not null`
				)
			)
			.all()
			.map((r) => r.productId as number)
	);
}

/** Uncategorized last, then category order, then unchecked before checked. */
export function sortList(items: ListItemView[]) {
	return [...items].sort(
		(a, b) =>
			Number(a.checked) - Number(b.checked) ||
			(a.categoryOrder ?? Infinity) - (b.categoryOrder ?? Infinity) ||
			a.name.localeCompare(b.name)
	);
}
