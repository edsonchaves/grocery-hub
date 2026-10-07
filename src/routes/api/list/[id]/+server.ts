import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/db/index.ts';
import { removeItem, setChecked, updateItem } from '#lib/server/list.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

const patchSchema = z.object({
	checked: z.boolean().optional(),
	qty: z.string().max(50).nullable().optional(),
	note: z.string().max(200).nullable().optional()
});

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const id = intParam(params.id);
	const body = patchSchema.safeParse(await request.json());
	if (!body.success) error(400, 'bad input');
	const db = getDb();
	const { checked, ...rest } = body.data;
	if (rest.qty !== undefined || rest.note !== undefined) updateItem(db, user.householdId, id, rest);
	if (checked !== undefined) setChecked(db, user.householdId, id, checked);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	removeItem(getDb(), user.householdId, intParam(params.id));
	return new Response(null, { status: 204 });
};
