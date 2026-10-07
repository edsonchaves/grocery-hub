import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	deleteProduct,
	getProduct,
	listCategories,
	listProducts,
	mergeProducts,
	updateProduct
} from '#lib/server/catalog.ts';
import { cheapestStore, priceHistory } from '#lib/server/insights.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals, params }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const id = intParam(params.id);
	const product = getProduct(db, user.householdId, id);
	if (!product) error(404, 'not found');
	return {
		product,
		categories: listCategories(db, user.householdId),
		others: listProducts(db, user.householdId)
			.filter((p) => p.id !== id)
			.map((p) => ({ id: p.id, name: p.name })),
		history: priceHistory(db, user.householdId, id),
		cheapest: cheapestStore(db, user.householdId, id)
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'auth.nameRequired' });
		updateProduct(getDb(), user.householdId, intParam(params.id), {
			name,
			categoryId: Number(f.get('categoryId')) || null,
			unit: String(f.get('unit') ?? ''),
			ean: String(f.get('ean') ?? '')
		});
	},
	merge: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const target = intParam((await request.formData()).get('targetId') as string);
		mergeProducts(getDb(), user.householdId, intParam(params.id), target);
		redirect(303, `/products/${target}`);
	},
	delete: async ({ locals, params }) => {
		const user = requireUser(locals);
		deleteProduct(getDb(), user.householdId, intParam(params.id));
		redirect(303, '/products');
	}
};
