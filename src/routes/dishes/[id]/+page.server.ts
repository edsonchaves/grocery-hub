import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	deleteDish,
	getDish,
	removeIngredient,
	renameDish,
	setIngredient
} from '#lib/server/meals.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import { QTY_UNITS, type QtyUnit } from '#lib/types.ts';
import type { Actions, PageServerLoadEvent } from './$types';

// only same-app paths, never "//host"
const backPath = (url: URL) => {
	const back = url.searchParams.get('back') ?? '';
	return /^\/(?!\/)/.test(back) ? back : '/dishes';
};
const isUnit = (v: unknown): v is QtyUnit =>
	typeof v === 'string' && (QTY_UNITS as readonly string[]).includes(v);

export const load = ({ locals, params, url }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	try {
		return { dish: getDish(getDb(), user.householdId, intParam(params.id)), back: backPath(url) };
	} catch {
		error(404, 'not found');
	}
};

export const actions: Actions = {
	rename: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400);
		renameDish(getDb(), user.householdId, intParam(params.id), name);
	},
	ingredient: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		const qty = Number(String(f.get('qty') ?? '').replace(',', '.'));
		const unit = f.get('unit');
		setIngredient(getDb(), user.householdId, intParam(params.id), {
			productId: Number(f.get('productId')) || undefined,
			text: String(f.get('text') ?? ''),
			qty: qty > 0 ? qty : null,
			unit: isUnit(unit) ? unit : null
		});
	},
	removeIngredient: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const f = await request.formData();
		removeIngredient(
			getDb(),
			user.householdId,
			intParam(params.id),
			intParam(f.get('productId') as string)
		);
	},
	delete: async ({ locals, params, url }) => {
		const user = requireUser(locals);
		deleteDish(getDb(), user.householdId, intParam(params.id));
		redirect(303, backPath(url));
	}
};
