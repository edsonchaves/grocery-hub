import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from './db';
import {
	pantryStatus,
	products,
	purchaseLines,
	purchases,
	suggestionDismissals
} from './db/schema';
import { openProductIds } from './list';

export const DAY = 24 * 60 * 60 * 1000;
export const MIN_PURCHASES = 3;
export const DUE_RATIO = 0.85;

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median gap in days between purchase days; undefined below MIN_PURCHASES. */
export function medianIntervalDays(times: number[]) {
	const days = [...new Set(times.map((t) => Math.floor(t / DAY)))].sort((a, b) => a - b);
	if (days.length < MIN_PURCHASES) return undefined;
	const gaps = days.slice(1).map((d, i) => d - days[i]);
	return median(gaps);
}

function purchaseTimesByProduct(db: Db, householdId: number) {
	const rows = db
		.select({ productId: purchaseLines.productId, at: purchases.purchasedAt })
		.from(purchaseLines)
		.innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
		.where(
			and(
				eq(purchases.householdId, householdId),
				eq(purchaseLines.kind, 'item'),
				isNotNull(purchaseLines.productId)
			)
		)
		.all();
	const map = new Map<number, number[]>();
	for (const r of rows) {
		const list = map.get(r.productId!) ?? [];
		list.push(r.at.getTime());
		map.set(r.productId!, list);
	}
	return map;
}

export type Suggestion = {
	productId: number;
	name: string;
	intervalDays: number;
	daysSince: number;
};

export function dueProducts(db: Db, householdId: number, now = Date.now()): Suggestion[] {
	const onList = openProductIds(db, householdId);
	const restocks = new Map(
		db
			.select({ productId: pantryStatus.productId, at: pantryStatus.lastRestockAt })
			.from(pantryStatus)
			.where(eq(pantryStatus.householdId, householdId))
			.all()
			.map((r) => [r.productId, r.at?.getTime() ?? 0])
	);
	const dismissed = new Map(
		db
			.select()
			.from(suggestionDismissals)
			.where(eq(suggestionDismissals.householdId, householdId))
			.all()
			.map((r) => [r.productId, r.dismissedAt.getTime()])
	);
	const names = new Map(
		db
			.select({ id: products.id, name: products.name })
			.from(products)
			.where(eq(products.householdId, householdId))
			.all()
			.map((p) => [p.id, p.name])
	);

	const out: Suggestion[] = [];
	for (const [productId, times] of purchaseTimesByProduct(db, householdId)) {
		const interval = medianIntervalDays(times);
		if (!interval || onList.has(productId)) continue;
		// a check-off or manual "in stock" after the last purchase counts as a restock too
		const last = Math.max(...times, restocks.get(productId) ?? 0);
		const daysSince = (now - last) / DAY;
		if (daysSince < DUE_RATIO * interval) continue;
		const d = dismissed.get(productId);
		if (d && d > last && now < d + interval * DAY) continue;
		out.push({ productId, name: names.get(productId) ?? '', intervalDays: interval, daysSince });
	}
	return out.sort((a, b) => b.daysSince / b.intervalDays - a.daysSince / a.intervalDays);
}

export function dismissSuggestion(
	db: Db,
	householdId: number,
	productId: number,
	now = Date.now()
) {
	db.insert(suggestionDismissals)
		.values({ householdId, productId, dismissedAt: new Date(now) })
		.onConflictDoUpdate({
			target: [suggestionDismissals.householdId, suggestionDismissals.productId],
			set: { dismissedAt: new Date(now) }
		})
		.run();
}
