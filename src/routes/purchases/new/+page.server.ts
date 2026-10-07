import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { listProducts } from '#lib/server/catalog.ts';
import { listStores, purchaseInputSchema, savePurchase } from '#lib/server/receipts/service.ts';
import { requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	return {
		stores: listStores(db, user.householdId).map((s) => s.name),
		products: listProducts(db, user.householdId).map((p) => ({ id: p.id, name: p.name }))
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requireUser(locals);
		let payload: unknown;
		try {
			payload = JSON.parse(String((await request.formData()).get('payload')));
		} catch {
			return fail(400);
		}
		const input = purchaseInputSchema.safeParse(payload);
		if (!input.success) return fail(400, { invalid: true });
		const result = savePurchase(getDb(), user.householdId, user.id, input.data);
		if (result.duplicate) return fail(409, { duplicate: true });
		redirect(303, '/purchases');
	}
};
