import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from './db';
import { pantryStatus, planWeeks, purchaseLines, purchases, stores } from './db/schema';
import { addItem, openProductIds } from './list';
import { dishIngredientsOf, dishNote, weekEnd, weekEntries } from './meals';
import { setStatus } from './pantry';
import { DAY, dueProducts } from './restock';
import { formatSum, type Qty } from '../qty';
import type { PantryStatus } from '../types';

export const MAIN_STORE_WINDOW_DAYS = 90;

export type CandidateState = 'need' | 'ask' | 'have' | 'on_list';

export type Candidate = {
	productId: number;
	name: string;
	qty: string;
	dishes: string[];
	restock: boolean;
	state: CandidateState;
	store: string | null;
	elsewhere: boolean;
};

const STATE_ORDER: Record<CandidateState, number> = { need: 0, ask: 1, have: 2, on_list: 3 };

function classify(status: PantryStatus | undefined, due: boolean, onList: boolean): CandidateState {
	if (onList) return 'on_list';
	if (status === 'out' || status === 'low') return 'need';
	if (status === 'in_stock') return due ? 'ask' : 'have';
	return due ? 'need' : 'ask';
}

/** Store of each product's most recent purchase. */
function usualStores(db: Db, householdId: number, productIds: number[]) {
	const out = new Map<number, string>();
	if (!productIds.length) return out;
	const rows = db
		.select({ productId: purchaseLines.productId, store: stores.name })
		.from(purchaseLines)
		.innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
		.innerJoin(stores, eq(stores.id, purchases.storeId))
		.where(
			and(eq(purchases.householdId, householdId), inArray(purchaseLines.productId, productIds))
		)
		.orderBy(desc(purchases.purchasedAt))
		.all();
	for (const r of rows) if (!out.has(r.productId!)) out.set(r.productId!, r.store);
	return out;
}

function mainStore(db: Db, householdId: number, now: number) {
	return (
		db
			.select({ store: stores.name, n: count() })
			.from(purchases)
			.innerJoin(stores, eq(stores.id, purchases.storeId))
			.where(
				and(
					eq(purchases.householdId, householdId),
					gte(purchases.purchasedAt, new Date(now - MAIN_STORE_WINDOW_DAYS * DAY))
				)
			)
			.groupBy(stores.id)
			.orderBy(desc(count()))
			.get()?.store ?? null
	);
}

/**
 * What the week needs: dish ingredients, planned products and restocks due by the week's
 * last day, classified against the list and the pantry.
 */
export function prepareShopping(db: Db, householdId: number, weekId: number, now = Date.now()) {
	const week = db
		.select()
		.from(planWeeks)
		.where(and(eq(planWeeks.id, weekId), eq(planWeeks.householdId, householdId)))
		.get();
	if (!week) throw new Error('week not found');

	const entries = weekEntries(db, weekId);
	const ingredients = dishIngredientsOf(
		db,
		entries.flatMap((e) => (e.dishId ? [e.dishId] : []))
	);
	const byDish = Map.groupBy(ingredients, (i) => i.dishId);

	const acc = new Map<
		number,
		{ name: string; qtys: Qty[]; dishes: Set<string>; restock: boolean }
	>();
	const need = (productId: number, name: string) => {
		let c = acc.get(productId);
		if (!c) acc.set(productId, (c = { name, qtys: [], dishes: new Set(), restock: false }));
		return c;
	};
	for (const e of entries) {
		if (e.kind === 'dish' && e.dishId) {
			for (const i of byDish.get(e.dishId) ?? []) {
				const c = need(i.productId, i.name);
				c.qtys.push({ qty: i.qty, unit: i.unit });
				c.dishes.add(e.dishName!);
			}
		} else if (e.kind === 'product' && e.productId) {
			need(e.productId, e.productName!).qtys.push({ qty: e.qty, unit: e.unit });
		}
	}

	const endOfWeek = new Date(`${weekEnd(week.startDate)}T23:59`).getTime();
	const due = new Set<number>();
	for (const s of dueProducts(db, householdId, Math.max(now, endOfWeek))) {
		due.add(s.productId);
		need(s.productId, s.name).restock = true;
	}

	const ids = [...acc.keys()];
	const statuses = new Map(
		ids.length
			? db
					.select({ productId: pantryStatus.productId, status: pantryStatus.status })
					.from(pantryStatus)
					.where(inArray(pantryStatus.productId, ids))
					.all()
					.map((r) => [r.productId, r.status])
			: []
	);
	const onList = openProductIds(db, householdId);
	const usual = usualStores(db, householdId, ids);
	const main = mainStore(db, householdId, now);

	const candidates: Candidate[] = [...acc].map(([productId, c]) => {
		const store = usual.get(productId) ?? null;
		return {
			productId,
			name: c.name,
			qty: formatSum(c.qtys),
			dishes: [...c.dishes],
			restock: c.restock,
			state: classify(statuses.get(productId), due.has(productId), onList.has(productId)),
			store,
			elsewhere: !!store && !!main && store !== main
		};
	});
	candidates.sort(
		(a, b) =>
			Number(a.elsewhere) - Number(b.elsewhere) ||
			STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
			a.name.localeCompare(b.name)
	);
	return { candidates, mainStore: main };
}

export type ShoppingAnswers = {
	/** Products to put on the list: needed items, "not at home" answers, overridden "have". */
	add: number[];
	/** "Yes, we have it" answers. */
	have: number[];
};

export function confirmShopping(
	db: Db,
	householdId: number,
	userId: number | null,
	weekId: number,
	answers: ShoppingAnswers,
	now = Date.now()
) {
	const { candidates } = prepareShopping(db, householdId, weekId, now);
	const byId = new Map(candidates.map((c) => [c.productId, c]));
	let added = 0;
	for (const id of answers.add) {
		const c = byId.get(id);
		if (!c || c.state === 'on_list') continue;
		const { duplicate } = addItem(db, householdId, userId, {
			productId: id,
			qty: c.qty,
			note: dishNote(c.dishes, c.elsewhere ? c.store : null)
		});
		if (!duplicate) added++;
		// list entry first, so the "out" status finds it and doesn't add a bare one
		if (c.state === 'ask') setStatus(db, householdId, userId, id, 'out');
	}
	for (const id of answers.have) {
		if (byId.get(id)?.state === 'ask') setStatus(db, householdId, userId, id, 'in_stock');
	}
	return { added };
}
