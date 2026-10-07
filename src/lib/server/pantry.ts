import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from './db';
import { categories, pantryStatus, products } from './db/schema';
import { getProduct } from './catalog';
import { addItem } from './list';
import type { PantryStatus } from '../types';

/** Purchases and check-offs: back in stock, remembering when. */
export function markRestocked(db: Db, householdId: number, productId: number, at: number) {
	const existing = db
		.select()
		.from(pantryStatus)
		.where(eq(pantryStatus.productId, productId))
		.get();
	const lastRestockAt =
		existing?.lastRestockAt && existing.lastRestockAt.getTime() > at
			? existing.lastRestockAt
			: new Date(at);
	db.insert(pantryStatus)
		.values({ productId, householdId, status: 'in_stock', updatedAt: new Date(), lastRestockAt })
		.onConflictDoUpdate({
			target: pantryStatus.productId,
			set: { status: 'in_stock', updatedAt: new Date(), lastRestockAt }
		})
		.run();
}

/** Manual status change. "out" puts the product on the list. */
export function setStatus(
	db: Db,
	householdId: number,
	userId: number | null,
	productId: number,
	status: PantryStatus
) {
	if (!getProduct(db, householdId, productId)) throw new Error('product not found');
	const now = new Date();
	const set =
		status === 'in_stock'
			? { status, updatedAt: now, lastRestockAt: now }
			: { status, updatedAt: now };
	db.insert(pantryStatus)
		.values({ productId, householdId, ...set })
		.onConflictDoUpdate({ target: pantryStatus.productId, set })
		.run();
	if (status === 'out') addItem(db, householdId, userId, { productId });
}

export function untrack(db: Db, householdId: number, productId: number) {
	db.delete(pantryStatus)
		.where(and(eq(pantryStatus.productId, productId), eq(pantryStatus.householdId, householdId)))
		.run();
}

export function pantryView(db: Db, householdId: number, filter?: PantryStatus) {
	return db
		.select({
			productId: products.id,
			name: products.name,
			status: pantryStatus.status,
			updatedAt: pantryStatus.updatedAt,
			lastRestockAt: pantryStatus.lastRestockAt,
			categoryId: categories.id,
			categoryName: categories.name
		})
		.from(pantryStatus)
		.innerJoin(products, eq(products.id, pantryStatus.productId))
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.where(
			filter
				? and(eq(pantryStatus.householdId, householdId), eq(pantryStatus.status, filter))
				: eq(pantryStatus.householdId, householdId)
		)
		.orderBy(
			sql`${categories.sortOrder} is null`,
			asc(categories.sortOrder),
			asc(sql`lower(${products.name})`)
		)
		.all();
}

export function getStatus(db: Db, productId: number) {
	return db.select().from(pantryStatus).where(eq(pantryStatus.productId, productId)).get();
}
