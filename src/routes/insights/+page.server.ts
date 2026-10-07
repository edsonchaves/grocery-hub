import { getDb } from '#lib/server/db/index.ts';
import { monthlyOverview } from '#lib/server/insights.ts';
import { requireUser } from '#lib/server/session.ts';
import type { PageServerLoadEvent } from './$types';

export const load = ({ locals, url }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const now = new Date();
	const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get('m') ?? '');
	const year = m ? Number(m[1]) : now.getFullYear();
	const month = m ? Math.min(12, Math.max(1, Number(m[2]))) : now.getMonth() + 1;
	return { year, month, overview: monthlyOverview(getDb(), user.householdId, year, month) };
};
