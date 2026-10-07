import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { listCategories, listProducts } from '#lib/server/catalog.ts';
import {
	buildReview,
	getReceipt,
	listStores,
	processReceipt,
	purchaseInputSchema,
	savePurchase
} from '#lib/server/receipts/service.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals, params }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const id = intParam(params.id);
	const receipt = getReceipt(db, user.householdId, id);
	if (!receipt) error(404, 'not found');
	return {
		receipt: { id: receipt.id, status: receipt.status, error: receipt.error, files: receipt.files },
		review: receipt.status === 'parsed' ? buildReview(db, user.householdId, id) : undefined,
		products: listProducts(db, user.householdId).map((p) => ({ id: p.id, name: p.name })),
		stores: listStores(db, user.householdId).map((s) => s.name),
		categories: listCategories(db, user.householdId)
	};
};

export const actions: Actions = {
	confirm: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const id = intParam(params.id);
		const db = getDb();
		const receipt = getReceipt(db, user.householdId, id);
		if (!receipt || receipt.status !== 'parsed') return fail(409);
		let payload: unknown;
		try {
			payload = JSON.parse(String((await request.formData()).get('payload')));
		} catch {
			return fail(400);
		}
		const input = purchaseInputSchema.safeParse(payload);
		if (!input.success) return fail(400, { invalid: true });
		const result = savePurchase(db, user.householdId, user.id, input.data, id);
		if (result.duplicate) return fail(409, { duplicate: true });
		redirect(303, '/receipts');
	},
	reparse: async ({ locals, params }) => {
		const user = requireUser(locals);
		const id = intParam(params.id);
		const db = getDb();
		const receipt = getReceipt(db, user.householdId, id);
		if (!receipt || receipt.status === 'confirmed') return fail(409);
		void processReceipt(db, id);
	}
};
