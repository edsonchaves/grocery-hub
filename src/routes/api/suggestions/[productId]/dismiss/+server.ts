import { getDb } from '#lib/server/db/index.ts';
import { dismissSuggestion } from '#lib/server/restock.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) => {
	dismissSuggestion(getDb(), requireUser(locals).householdId, intParam(params.productId));
	return new Response(null, { status: 204 });
};
