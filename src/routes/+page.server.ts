import { getDb } from '#lib/server/db/index.ts';
import { listView, sortList } from '#lib/server/list.ts';
import { dueProducts } from '#lib/server/restock.ts';
import { requireUser } from '#lib/server/session.ts';
import type { PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	return {
		items: sortList(listView(db, user.householdId)),
		suggestions: dueProducts(db, user.householdId).slice(0, 8)
	};
};
