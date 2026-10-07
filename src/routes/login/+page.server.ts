import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { checkPassword, hasUsers, LoginLimiter } from '#lib/server/auth.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

const limiter = new LoginLimiter();

export const load = ({ locals }: PageServerLoadEvent) => {
	if (locals.user) redirect(303, '/');
	if (!hasUsers(getDb())) redirect(303, '/setup');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const db = getDb();
		const f = await request.formData();
		const name = String(f.get('name') ?? '');
		const key = `${getClientAddress()}|${name.trim().toLowerCase()}`;
		if (limiter.blocked(key)) return fail(429, { name, error: 'login.rateLimited' });
		const user = await checkPassword(db, name, String(f.get('password') ?? ''));
		if (!user) {
			limiter.fail(key);
			return fail(400, { name, error: 'login.invalid' });
		}
		limiter.reset(key);
		startSession(db, cookies, url, user.id);
		redirect(303, '/');
	}
};
