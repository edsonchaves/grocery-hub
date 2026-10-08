import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { rankProducts, searchProducts } from '#lib/server/catalog.ts';
import { listDishes } from '#lib/server/meals.ts';
import { requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const db = getDb();
	const q = url.searchParams.get('q') ?? '';
	return json({
		dishes: rankProducts(q, listDishes(db, user.householdId), 5).map(({ item }) => ({
			id: item.id,
			name: item.name
		})),
		products: searchProducts(db, user.householdId, q, 5).map((p) => ({ id: p.id, name: p.name }))
	});
};
