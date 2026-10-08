import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	WeekOverlap,
	adjacentWeeks,
	createWeek,
	currentOrNextWeek,
	localDate,
	nextWeekStart
} from '#lib/server/meals.ts';
import { requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const today = localDate();
	const week = currentOrNextWeek(db, user.householdId, today);
	if (week) redirect(303, `/week/${week.startDate}`);
	return {
		nextStart: nextWeekStart(db, user.householdId, today),
		last: adjacentWeeks(db, user.householdId, today).prev?.startDate ?? null
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireUser(locals);
		const start = String((await request.formData()).get('start') ?? '');
		try {
			createWeek(getDb(), user.householdId, start);
		} catch (e) {
			return fail(e instanceof WeekOverlap ? 409 : 400, { overlap: e instanceof WeekOverlap });
		}
		redirect(303, `/week/${start}`);
	}
};
