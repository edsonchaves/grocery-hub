import { getDb } from '#lib/server/db/index.ts';
import { clearChecked } from '#lib/server/list.ts';
import { requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals }) => {
	clearChecked(getDb(), requireUser(locals).householdId);
	return new Response(null, { status: 204 });
};
