import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '#lib/server/db/index.ts';
import { households } from '#lib/server/db/schema.ts';
import { listView } from '#lib/server/list.ts';
import { monthlyOverview } from '#lib/server/insights.ts';
import type { RequestHandler } from './$types';

const same = (a: string, b: string) =>
	a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Read-only numbers for the Homepage customapi widget. */
export const GET: RequestHandler = ({ request, url }) => {
	const token =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
		url.searchParams.get('token');
	if (!token) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb();
	const household = db
		.select()
		.from(households)
		.all()
		.find((h) => same(h.widgetToken, token));
	if (!household) return json({ error: 'unauthorized' }, { status: 401 });

	const now = new Date();
	const month = monthlyOverview(db, household.id, now.getFullYear(), now.getMonth() + 1);
	return json({
		list_count: listView(db, household.id).filter((i) => !i.checked).length,
		month_spend: month.total / 100,
		month_delta: month.deltaPrev / 100
	});
};
