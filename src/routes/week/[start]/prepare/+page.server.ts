import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getWeek, weekEnd } from '#lib/server/meals.ts';
import { requireUser } from '#lib/server/session.ts';
import { confirmShopping, prepareShopping } from '#lib/server/weekly-shopping.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals, params }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const week = getWeek(db, user.householdId, params.start);
	if (!week) redirect(303, '/week');
	return {
		startDate: week.startDate,
		endDate: weekEnd(week.startDate),
		...prepareShopping(db, user.householdId, week.id)
	};
};

export const actions: Actions = {
	confirm: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const db = getDb();
		const week = getWeek(db, user.householdId, params.start);
		if (!week) redirect(303, '/week');
		const f = await request.formData();
		const add = f.getAll('add').map(Number);
		const have: number[] = [];
		for (const [key, value] of f) {
			if (!key.startsWith('ask-')) continue;
			(value === 'have' ? have : add).push(Number(key.slice(4)));
		}
		confirmShopping(db, user.householdId, user.id, week.id, { add, have });
		redirect(303, '/');
	}
};
