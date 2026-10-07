import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/db/index.ts';
import { addItem, listView, sortList } from '#lib/server/list.ts';
import { requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json(sortList(listView(getDb(), user.householdId)));
};

const addSchema = z.object({
	productId: z.number().int().positive().optional(),
	text: z.string().max(200).optional(),
	qty: z.string().max(50).optional(),
	note: z.string().max(200).optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = addSchema.safeParse(await request.json());
	if (!body.success || (!body.data.productId && !body.data.text?.trim())) error(400, 'bad input');
	return json(addItem(getDb(), user.householdId, user.id, body.data));
};
