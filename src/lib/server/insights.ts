import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from './db';
import { categories, listItems, products, purchaseLines, purchases, stores } from './db/schema';
import { DAY } from './restock';

const monthStart = (y: number, m: number) => new Date(y, m - 1, 1);

function monthTotal(db: Db, householdId: number, y: number, m: number) {
	return db
		.select({ total: purchases.totalCents })
		.from(purchases)
		.where(
			and(
				eq(purchases.householdId, householdId),
				gte(purchases.purchasedAt, monthStart(y, m)),
				lt(purchases.purchasedAt, monthStart(y, m + 1))
			)
		)
		.all()
		.reduce((s, r) => s + r.total, 0);
}

export type Breakdown = { key: string; label: string | null; cents: number }[];

export function monthlyOverview(db: Db, householdId: number, year: number, month: number) {
	const from = monthStart(year, month);
	const to = monthStart(year, month + 1);
	const monthPurchases = db
		.select({ id: purchases.id, total: purchases.totalCents, store: stores.name })
		.from(purchases)
		.innerJoin(stores, eq(stores.id, purchases.storeId))
		.where(
			and(
				eq(purchases.householdId, householdId),
				gte(purchases.purchasedAt, from),
				lt(purchases.purchasedAt, to)
			)
		)
		.all();
	const total = monthPurchases.reduce((s, p) => s + p.total, 0);

	const byStore = new Map<string, number>();
	for (const p of monthPurchases) byStore.set(p.store, (byStore.get(p.store) ?? 0) + p.total);

	const lines = db
		.select({
			purchaseId: purchaseLines.purchaseId,
			kind: purchaseLines.kind,
			cents: purchaseLines.lineCents,
			discount: purchaseLines.discountCents,
			categoryId: categories.id,
			category: categories.name
		})
		.from(purchaseLines)
		.innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
		.leftJoin(products, eq(products.id, purchaseLines.productId))
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.where(
			and(
				eq(purchases.householdId, householdId),
				gte(purchases.purchasedAt, from),
				lt(purchases.purchasedAt, to)
			)
		)
		.all();

	const byCategory = new Map<string, { label: string | null; cents: number }>();
	const add = (key: string, label: string | null, cents: number) => {
		const e = byCategory.get(key) ?? { label, cents: 0 };
		e.cents += cents;
		byCategory.set(key, e);
	};
	const linesPerPurchase = new Map<number, number>();
	for (const l of lines) {
		const c = l.cents + l.discount;
		linesPerPurchase.set(l.purchaseId, (linesPerPurchase.get(l.purchaseId) ?? 0) + c);
		if (l.kind === 'pfand') add('pfand', null, c);
		else if (l.categoryId) add(`c${l.categoryId}`, l.category, c);
		else add('uncategorized', null, c);
	}
	// purchases without (complete) lines: the rest of the total is uncategorized
	for (const p of monthPurchases) {
		const rest = p.total - (linesPerPurchase.get(p.id) ?? 0);
		if (rest) add('uncategorized', null, rest);
	}

	const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
	const previousMonth = monthTotal(db, householdId, prev[0], prev[1]);
	let sixSum = 0;
	for (let i = 1; i <= 6; i++) {
		const d = new Date(year, month - 1 - i, 1);
		sixSum += monthTotal(db, householdId, d.getFullYear(), d.getMonth() + 1);
	}
	const sixMonthAvg = Math.round(sixSum / 6);

	return {
		total,
		previousMonth,
		sixMonthAvg,
		deltaPrev: total - previousMonth,
		deltaAvg: total - sixMonthAvg,
		byStore: [...byStore]
			.map(([label, cents]) => ({ key: label, label, cents }))
			.sort((a, b) => b.cents - a.cents) as Breakdown,
		byCategory: [...byCategory]
			.map(([key, v]) => ({ key, label: v.label, cents: v.cents }))
			.filter((c) => c.cents !== 0)
			.sort((a, b) => b.cents - a.cents) as Breakdown
	};
}

export type PricePoint = { at: number; store: string; unitCents: number; unit: string | null };

export function priceHistory(db: Db, householdId: number, productId: number, since?: number) {
	const rows = db
		.select({
			at: purchases.purchasedAt,
			store: stores.name,
			cents: purchaseLines.lineCents,
			discount: purchaseLines.discountCents,
			qty: purchaseLines.qty,
			unit: purchaseLines.unit
		})
		.from(purchaseLines)
		.innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
		.innerJoin(stores, eq(stores.id, purchases.storeId))
		.where(
			and(
				eq(purchases.householdId, householdId),
				eq(purchaseLines.productId, productId),
				eq(purchaseLines.kind, 'item'),
				since ? gte(purchases.purchasedAt, new Date(since)) : undefined
			)
		)
		.orderBy(purchases.purchasedAt)
		.all();
	const points: PricePoint[] = rows
		.filter((r) => r.qty > 0)
		.map((r) => ({
			at: r.at.getTime(),
			store: r.store,
			unitCents: Math.round((r.cents + r.discount) / r.qty),
			unit: r.unit === 'pc' ? null : r.unit
		}));
	if (!points.length) return { points, stats: null };
	const prices = points.map((p) => p.unitCents);
	return {
		points,
		stats: {
			latest: prices.at(-1)!,
			min: Math.min(...prices),
			avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
		}
	};
}

function dominantUnit(points: PricePoint[]) {
	const counts = new Map<string | null, number>();
	for (const p of points) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Latest unit price per store over the last 90 days, cheapest first; only the dominant unit. */
export function storePrices(db: Db, householdId: number, productId: number, now = Date.now()) {
	const { points } = priceHistory(db, householdId, productId, now - 90 * DAY);
	const unit = dominantUnit(points);
	const latest = new Map<string, PricePoint>();
	for (const p of points) if (p.unit === unit) latest.set(p.store, p);
	return [...latest.values()].sort((a, b) => a.unitCents - b.unitCents);
}

export function cheapestStore(db: Db, householdId: number, productId: number, now = Date.now()) {
	const prices = storePrices(db, householdId, productId, now);
	if (!prices.length) return undefined;
	return {
		store: prices[0].store,
		unitCents: prices[0].unitCents,
		diffCents: prices.length > 1 ? prices[1].unitCents - prices[0].unitCents : null
	};
}

const numericQty = (q: string | null) => {
	if (!q || !/^\d+([.,]\d+)?$/.test(q.trim())) return 1;
	return Number(q.trim().replace(',', '.'));
};

/** Estimated cost of the open list per store, using each store's latest 90-day price. */
export function basketEstimate(db: Db, householdId: number, now = Date.now()) {
	const items = db
		.select({ productId: listItems.productId, qty: listItems.qty })
		.from(listItems)
		.where(and(eq(listItems.householdId, householdId), eq(listItems.checked, false)))
		.all()
		.filter((i) => i.productId);
	const activeStores = [
		...new Set(
			db
				.select({ store: stores.name })
				.from(purchases)
				.innerJoin(stores, eq(stores.id, purchases.storeId))
				.where(
					and(
						eq(purchases.householdId, householdId),
						gte(purchases.purchasedAt, new Date(now - 90 * DAY))
					)
				)
				.orderBy(desc(purchases.purchasedAt))
				.all()
				.map((r) => r.store)
		)
	];
	const result = new Map(
		activeStores.map((s) => [s, { store: s, totalCents: 0, priced: 0, missing: 0 }])
	);
	for (const item of items) {
		const prices = new Map(
			storePrices(db, householdId, item.productId!, now).map((p) => [p.store, p])
		);
		for (const [store, r] of result) {
			const p = prices.get(store);
			if (p) {
				r.totalCents += Math.round(p.unitCents * (p.unit ? 1 : numericQty(item.qty)));
				r.priced++;
			} else r.missing++;
		}
	}
	return [...result.values()]
		.filter((r) => r.priced > 0)
		.sort((a, b) => a.missing - b.missing || a.totalCents - b.totalCents);
}
