import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { searchProducts } from '#lib/server/catalog.ts';
import { requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const q = url.searchParams.get('q') ?? '';
	return json(
		searchProducts(getDb(), user.householdId, q).map((p) => ({
			id: p.id,
			name: p.name,
			categoryName: p.categoryName
		}))
	);
};
