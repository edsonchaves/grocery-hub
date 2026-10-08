import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	addEntry,
	addMissingToList,
	adjacentWeeks,
	copyPreviousWeek,
	getDish,
	getWeek,
	listDishes,
	localDate,
	missingForCurrentWeek,
	nextWeekStart,
	removeEntry,
	weekView
} from '#lib/server/meals.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent, RequestEvent } from './$types';

export const load = ({ locals, params }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const view = weekView(db, user.householdId, params.start);
	if (!view) redirect(303, '/week');
	const today = localDate();
	const { prev, next } = adjacentWeeks(db, user.householdId, view.startDate);
	const empty = !view.wholeWeek.length && view.days.every((d) => !d.entries.length);
	return {
		view,
		today,
		prev: prev?.startDate ?? null,
		next: next?.startDate ?? null,
		nextStart: nextWeekStart(db, user.householdId, today),
		canCopy: empty && !!prev,
		ingredientCounts: Object.fromEntries(
			listDishes(db, user.householdId).map((d) => [d.id, d.ingredients])
		)
	};
};

function ownWeek({ locals, params }: RequestEvent) {
	const user = requireUser(locals);
	const week = getWeek(getDb(), user.householdId, params.start);
	return { user, week };
}

export const actions: Actions = {
	add: async (event) => {
		const { user, week } = ownWeek(event);
		if (!week) return fail(404);
		const db = getDb();
		const hh = user.householdId;
		const f = await event.request.formData();
		const kind = f.get('kind');
		const date = f.get('date') ? String(f.get('date')) : null;
		const id = Number(f.get('id')) || undefined;
		const name = String(f.get('name') ?? '');
		try {
			if (kind === 'leftovers') addEntry(db, hh, week.id, { date, kind });
			else if (kind === 'product') {
				addEntry(db, hh, week.id, { date, kind, productId: id, text: name });
			} else if (kind === 'dish') {
				const { dishId } = addEntry(db, hh, week.id, { date, kind, dishId: id, dishName: name });
				if (!getDish(db, hh, dishId!).ingredients.length) return { dishId, newDish: true };
				const missing = missingForCurrentWeek(db, hh, week.id, dishId!);
				return { dishId, missing: missing.map((m) => ({ productId: m.productId, name: m.name })) };
			} else return fail(400);
		} catch {
			return fail(400);
		}
	},
	remove: async (event) => {
		const { user } = ownWeek(event);
		const f = await event.request.formData();
		removeEntry(getDb(), user.householdId, intParam(f.get('entryId') as string));
	},
	copy: async (event) => {
		const { user, week } = ownWeek(event);
		if (!week) return fail(404);
		copyPreviousWeek(getDb(), user.householdId, week.id);
	},
	addMissing: async (event) => {
		const { user } = ownWeek(event);
		const f = await event.request.formData();
		addMissingToList(
			getDb(),
			user.householdId,
			user.id,
			intParam(f.get('dishId') as string),
			f.getAll('productId').map(Number)
		);
	}
};
