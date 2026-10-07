import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { addItem, openProductIds } from '#lib/server/list.ts';
import { pantryView, setStatus } from '#lib/server/pantry.ts';
import { findOrCreateProduct } from '#lib/server/catalog.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import { PANTRY_STATUSES, type PantryStatus } from '#lib/types.ts';
import type { Actions, PageServerLoadEvent } from './$types';

const isStatus = (v: unknown): v is PantryStatus =>
	typeof v === 'string' && (PANTRY_STATUSES as readonly string[]).includes(v);

export const load = ({ locals, url }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const filter = url.searchParams.get('status');
	const status = isStatus(filter) ? filter : undefined;
	return {
		status,
		products: pantryView(db, user.householdId, status).map((p) => ({
			...p,
			lastRestockAt: p.lastRestockAt?.getTime() ?? null
		})),
		onList: [...openProductIds(db, user.householdId)]
	};
};

export const actions: Actions = {
	status: async ({ locals, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		const status = f.get('status');
		if (!isStatus(status)) return fail(400);
		setStatus(getDb(), user.householdId, user.id, intParam(f.get('productId') as string), status);
	},
	addToList: async ({ locals, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		addItem(getDb(), user.householdId, user.id, {
			productId: intParam(f.get('productId') as string)
		});
	},
	track: async ({ locals, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		const db = getDb();
		const productId =
			Number(f.get('productId')) ||
			findOrCreateProduct(db, user.householdId, String(f.get('text') ?? '')).id;
		setStatus(db, user.householdId, user.id, productId, 'in_stock');
	}
};
