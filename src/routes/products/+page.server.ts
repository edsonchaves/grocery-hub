import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	createProduct,
	findProductByName,
	listCategories,
	listProducts
} from '#lib/server/catalog.ts';
import { requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	return {
		products: listProducts(db, user.householdId),
		categories: listCategories(db, user.householdId)
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		if (!name) return fail(400);
		const db = getDb();
		const p =
			findProductByName(db, user.householdId, name) ??
			createProduct(db, user.householdId, {
				name,
				categoryId: Number(f.get('categoryId')) || null
			});
		redirect(303, `/products/${p.id}`);
	}
};
