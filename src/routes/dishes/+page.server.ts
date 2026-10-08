import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { findOrCreateDish, listDishes } from '#lib/server/meals.ts';
import { requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	return { dishes: listDishes(getDb(), user.householdId) };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireUser(locals);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400);
		const dish = findOrCreateDish(getDb(), user.householdId, name);
		redirect(303, `/dishes/${dish.id}`);
	}
};
