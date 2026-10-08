import { and, asc, desc, eq, gt, gte, inArray, lt, lte, max, sql } from 'drizzle-orm';
import type { Db } from './db';
import {
	dishIngredients,
	dishes,
	pantryStatus,
	planEntries,
	planWeeks,
	products
} from './db/schema';
import { findOrCreateProduct, getProduct } from './catalog';
import { addItem, openProductIds } from './list';
import { formatQty } from '../qty';
import type { PlanEntryKind, QtyUnit } from '../types';

// ---- dates (local calendar days as YYYY-MM-DD) ----

export const WEEK_DAYS = 7;

export function addDays(date: string, n: number) {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function localDate(at = new Date()) {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

export const weekEnd = (start: string) => addDays(start, WEEK_DAYS - 1);
export const weekDates = (start: string) =>
	Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

// ---- dishes ----

export type IngredientInput = {
	productId?: number;
	text?: string;
	qty?: number | null;
	unit?: QtyUnit | null;
};

function ownDish(db: Db, householdId: number, id: number) {
	const dish = db
		.select()
		.from(dishes)
		.where(and(eq(dishes.id, id), eq(dishes.householdId, householdId)))
		.get();
	if (!dish) throw new Error('dish not found');
	return dish;
}

export function findOrCreateDish(db: Db, householdId: number, name: string) {
	const clean = name.trim();
	if (!clean) throw new Error('name required');
	return (
		db
			.select()
			.from(dishes)
			.where(and(eq(dishes.householdId, householdId), sql`lower(${dishes.name}) = lower(${clean})`))
			.get() ?? db.insert(dishes).values({ householdId, name: clean }).returning().get()
	);
}

export function renameDish(db: Db, householdId: number, id: number, name: string) {
	ownDish(db, householdId, id);
	db.update(dishes).set({ name: name.trim() }).where(eq(dishes.id, id)).run();
}

export function deleteDish(db: Db, householdId: number, id: number) {
	ownDish(db, householdId, id);
	db.delete(dishes).where(eq(dishes.id, id)).run();
}

export function listDishes(db: Db, householdId: number) {
	return db
		.select({
			id: dishes.id,
			name: dishes.name,
			ingredients: sql<number>`count(${dishIngredients.id})`
		})
		.from(dishes)
		.leftJoin(dishIngredients, eq(dishIngredients.dishId, dishes.id))
		.where(eq(dishes.householdId, householdId))
		.groupBy(dishes.id)
		.orderBy(sql`lower(${dishes.name})`)
		.all();
}

export function dishIngredientsOf(db: Db, dishIds: number[]) {
	if (!dishIds.length) return [];
	return db
		.select({
			dishId: dishIngredients.dishId,
			productId: dishIngredients.productId,
			name: products.name,
			qty: dishIngredients.qty,
			unit: dishIngredients.unit
		})
		.from(dishIngredients)
		.innerJoin(products, eq(products.id, dishIngredients.productId))
		.where(inArray(dishIngredients.dishId, dishIds))
		.orderBy(asc(dishIngredients.id))
		.all();
}

export function getDish(db: Db, householdId: number, id: number) {
	const dish = ownDish(db, householdId, id);
	return { ...dish, ingredients: dishIngredientsOf(db, [id]) };
}

function resolveProduct(db: Db, householdId: number, input: { productId?: number; text?: string }) {
	if (input.productId) {
		if (!getProduct(db, householdId, input.productId)) throw new Error('product not found');
		return input.productId;
	}
	if (!input.text?.trim()) throw new Error('product required');
	return findOrCreateProduct(db, householdId, input.text).id;
}

/** Adds the ingredient, or updates its quantity if the dish already has that product. */
export function setIngredient(db: Db, householdId: number, dishId: number, input: IngredientInput) {
	ownDish(db, householdId, dishId);
	const productId = resolveProduct(db, householdId, input);
	const qty = input.qty ?? null;
	const unit = qty == null ? null : (input.unit ?? 'pc');
	db.insert(dishIngredients)
		.values({ dishId, productId, qty, unit })
		.onConflictDoUpdate({
			target: [dishIngredients.dishId, dishIngredients.productId],
			set: { qty, unit }
		})
		.run();
	return productId;
}

export function removeIngredient(db: Db, householdId: number, dishId: number, productId: number) {
	ownDish(db, householdId, dishId);
	db.delete(dishIngredients)
		.where(and(eq(dishIngredients.dishId, dishId), eq(dishIngredients.productId, productId)))
		.run();
}

// ---- weeks ----

export class WeekOverlap extends Error {}

export type Week = typeof planWeeks.$inferSelect;

export function getWeek(db: Db, householdId: number, startDate: string) {
	return db
		.select()
		.from(planWeeks)
		.where(and(eq(planWeeks.householdId, householdId), eq(planWeeks.startDate, startDate)))
		.get();
}

function ownWeek(db: Db, householdId: number, id: number) {
	const week = db
		.select()
		.from(planWeeks)
		.where(and(eq(planWeeks.id, id), eq(planWeeks.householdId, householdId)))
		.get();
	if (!week) throw new Error('week not found');
	return week;
}

export function weekContaining(db: Db, householdId: number, date: string) {
	return db
		.select()
		.from(planWeeks)
		.where(
			and(
				eq(planWeeks.householdId, householdId),
				gte(planWeeks.startDate, addDays(date, -(WEEK_DAYS - 1))),
				lte(planWeeks.startDate, date)
			)
		)
		.get();
}

export function adjacentWeeks(db: Db, householdId: number, startDate: string) {
	const prev = db
		.select()
		.from(planWeeks)
		.where(and(eq(planWeeks.householdId, householdId), lt(planWeeks.startDate, startDate)))
		.orderBy(desc(planWeeks.startDate))
		.get();
	const next = db
		.select()
		.from(planWeeks)
		.where(and(eq(planWeeks.householdId, householdId), gt(planWeeks.startDate, startDate)))
		.orderBy(asc(planWeeks.startDate))
		.get();
	return { prev, next };
}

/** The week to show by default: the one containing today, else the next planned one. */
export function currentOrNextWeek(db: Db, householdId: number, today = localDate()) {
	return weekContaining(db, householdId, today) ?? adjacentWeeks(db, householdId, today).next;
}

/** Day after the latest week ends, but never in the past. */
export function nextWeekStart(db: Db, householdId: number, today = localDate()) {
	const latest = db
		.select({ start: max(planWeeks.startDate) })
		.from(planWeeks)
		.where(eq(planWeeks.householdId, householdId))
		.get()?.start;
	const candidate = latest ? addDays(latest, WEEK_DAYS) : today;
	return candidate < today ? today : candidate;
}

export function createWeek(db: Db, householdId: number, startDate: string) {
	if (!isDate(startDate)) throw new Error('invalid date');
	const clash = db
		.select({ id: planWeeks.id })
		.from(planWeeks)
		.where(
			and(
				eq(planWeeks.householdId, householdId),
				gt(planWeeks.startDate, addDays(startDate, -WEEK_DAYS)),
				lt(planWeeks.startDate, addDays(startDate, WEEK_DAYS))
			)
		)
		.get();
	if (clash) throw new WeekOverlap(startDate);
	return db.insert(planWeeks).values({ householdId, startDate }).returning().get();
}

// ---- entries ----

export type EntryInput = { date: string | null } & (
	| { kind: 'dish'; dishId?: number; dishName?: string }
	| {
			kind: 'product';
			productId?: number;
			text?: string;
			qty?: number | null;
			unit?: QtyUnit | null;
	  }
	| { kind: 'leftovers' }
);

export function addEntry(db: Db, householdId: number, weekId: number, input: EntryInput) {
	const week = ownWeek(db, householdId, weekId);
	if (input.date !== null && !weekDates(week.startDate).includes(input.date)) {
		throw new Error('date outside week');
	}
	let dishId: number | null = null;
	let productId: number | null = null;
	let qty: number | null = null;
	let unit: QtyUnit | null = null;
	if (input.kind === 'dish') {
		dishId = input.dishId
			? ownDish(db, householdId, input.dishId).id
			: findOrCreateDish(db, householdId, input.dishName ?? '').id;
	} else if (input.kind === 'product') {
		productId = resolveProduct(db, householdId, input);
		qty = input.qty ?? null;
		unit = qty == null ? null : (input.unit ?? 'pc');
	}
	const last = db
		.select({ p: max(planEntries.position) })
		.from(planEntries)
		.where(eq(planEntries.weekId, weekId))
		.get()?.p;
	return db
		.insert(planEntries)
		.values({
			weekId,
			date: input.date,
			kind: input.kind,
			dishId,
			productId,
			qty,
			unit,
			position: (last ?? -1) + 1
		})
		.returning()
		.get();
}

function ownEntry(db: Db, householdId: number, id: number) {
	const row = db
		.select({ entry: planEntries })
		.from(planEntries)
		.innerJoin(planWeeks, eq(planWeeks.id, planEntries.weekId))
		.where(and(eq(planEntries.id, id), eq(planWeeks.householdId, householdId)))
		.get();
	if (!row) throw new Error('entry not found');
	return row.entry;
}

export function removeEntry(db: Db, householdId: number, id: number) {
	ownEntry(db, householdId, id);
	db.delete(planEntries).where(eq(planEntries.id, id)).run();
}

/** Moves an entry to another day of its week, or to the whole-week block (null). */
export function moveEntry(db: Db, householdId: number, id: number, date: string | null) {
	const entry = ownEntry(db, householdId, id);
	const week = ownWeek(db, householdId, entry.weekId);
	if (date !== null && !weekDates(week.startDate).includes(date)) {
		throw new Error('date outside week');
	}
	db.update(planEntries).set({ date }).where(eq(planEntries.id, id)).run();
}

export type EntryView = {
	id: number;
	kind: PlanEntryKind;
	date: string | null;
	dishId: number | null;
	productId: number | null;
	name: string | null;
	qty: string;
};

export function weekEntries(db: Db, weekId: number) {
	return db
		.select({
			id: planEntries.id,
			kind: planEntries.kind,
			date: planEntries.date,
			dishId: planEntries.dishId,
			productId: planEntries.productId,
			dishName: dishes.name,
			productName: products.name,
			qty: planEntries.qty,
			unit: planEntries.unit
		})
		.from(planEntries)
		.leftJoin(dishes, eq(dishes.id, planEntries.dishId))
		.leftJoin(products, eq(products.id, planEntries.productId))
		.where(eq(planEntries.weekId, weekId))
		.orderBy(asc(planEntries.position), asc(planEntries.id))
		.all();
}

export function weekView(db: Db, householdId: number, startDate: string) {
	const week = getWeek(db, householdId, startDate);
	if (!week) return undefined;
	const entries: EntryView[] = weekEntries(db, week.id).map((e) => ({
		id: e.id,
		kind: e.kind,
		date: e.date,
		dishId: e.dishId,
		productId: e.productId,
		name: e.dishName ?? e.productName,
		qty: formatQty(e.qty, e.unit)
	}));
	return {
		id: week.id,
		startDate: week.startDate,
		endDate: weekEnd(week.startDate),
		days: weekDates(week.startDate).map((date) => ({
			date,
			entries: entries.filter((e) => e.date === date)
		})),
		wholeWeek: entries.filter((e) => e.date === null)
	};
}

/** Fills an empty week with the previous week's entries, same weekday offsets. */
export function copyPreviousWeek(db: Db, householdId: number, weekId: number) {
	const week = ownWeek(db, householdId, weekId);
	if (weekEntries(db, weekId).length) return false;
	const prev = adjacentWeeks(db, householdId, week.startDate).prev;
	if (!prev) return false;
	const offset = Math.round(
		(Date.parse(week.startDate) - Date.parse(prev.startDate)) / (24 * 60 * 60 * 1000)
	);
	const source = db.select().from(planEntries).where(eq(planEntries.weekId, prev.id)).all();
	for (const e of source) {
		db.insert(planEntries)
			.values({
				weekId,
				date: e.date === null ? null : addDays(e.date, offset),
				kind: e.kind,
				dishId: e.dishId,
				productId: e.productId,
				qty: e.qty,
				unit: e.unit,
				position: e.position
			})
			.run();
	}
	return source.length > 0;
}

// ---- missing ingredients ----

/** Ingredients of the dish that are neither in stock nor already on the list. */
export function missingIngredients(db: Db, householdId: number, dishId: number) {
	const ingredients = getDish(db, householdId, dishId).ingredients;
	if (!ingredients.length) return [];
	const inStock = new Set(
		db
			.select({ id: pantryStatus.productId })
			.from(pantryStatus)
			.where(
				and(
					eq(pantryStatus.householdId, householdId),
					eq(pantryStatus.status, 'in_stock'),
					inArray(
						pantryStatus.productId,
						ingredients.map((i) => i.productId)
					)
				)
			)
			.all()
			.map((r) => r.id)
	);
	const onList = openProductIds(db, householdId);
	return ingredients.filter((i) => !inStock.has(i.productId) && !onList.has(i.productId));
}

/** Warning for a dish planned in the week that contains today; future weeks get none. */
export function missingForCurrentWeek(
	db: Db,
	householdId: number,
	weekId: number,
	dishId: number,
	today = localDate()
) {
	const week = ownWeek(db, householdId, weekId);
	if (!weekDates(week.startDate).includes(today)) return [];
	return missingIngredients(db, householdId, dishId);
}

export const dishNote = (dishNames: string[], store?: string | null) =>
	[dishNames.length ? `p/ ${dishNames.join(', ')}` : '', store ?? ''].filter(Boolean).join(' · ') ||
	undefined;

export function addMissingToList(
	db: Db,
	householdId: number,
	userId: number | null,
	dishId: number,
	productIds: number[]
) {
	const dish = getDish(db, householdId, dishId);
	for (const i of dish.ingredients) {
		if (!productIds.includes(i.productId)) continue;
		addItem(db, householdId, userId, {
			productId: i.productId,
			qty: formatQty(i.qty, i.unit),
			note: dishNote([dish.name])
		});
	}
}
