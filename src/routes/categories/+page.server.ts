import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	createCategory,
	deleteCategory,
	listCategories,
	moveCategory,
	renameCategory
} from '#lib/server/catalog.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => ({
	categories: listCategories(getDb(), requireUser(locals).householdId)
});

async function form(request: Request) {
	const f = await request.formData();
	return { id: () => intParam(f.get('id') as string), name: String(f.get('name') ?? '').trim() };
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const { name } = await form(request);
		if (!name) return fail(400);
		createCategory(getDb(), requireUser(locals).householdId, name);
	},
	rename: async ({ locals, request }) => {
		const { id, name } = await form(request);
		if (!name) return fail(400);
		renameCategory(getDb(), requireUser(locals).householdId, id(), name);
	},
	up: async ({ locals, request }) => {
		moveCategory(getDb(), requireUser(locals).householdId, (await form(request)).id(), -1);
	},
	down: async ({ locals, request }) => {
		moveCategory(getDb(), requireUser(locals).householdId, (await form(request)).id(), 1);
	},
	delete: async ({ locals, request }) => {
		deleteCategory(getDb(), requireUser(locals).householdId, (await form(request)).id());
	}
};
