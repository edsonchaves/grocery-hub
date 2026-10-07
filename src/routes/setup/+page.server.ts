import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { AuthError, hasUsers, setupHousehold } from '#lib/server/auth.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions } from './$types';

export const load = () => {
	if (hasUsers(getDb())) redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		const db = getDb();
		if (hasUsers(db)) redirect(303, '/login');
		const f = await request.formData();
		const name = String(f.get('name') ?? '');
		try {
			const user = await setupHousehold(db, {
				household: String(f.get('household') ?? ''),
				name,
				password: String(f.get('password') ?? ''),
				locale: locals.locale
			});
			startSession(db, cookies, url, user.id);
		} catch (e) {
			if (e instanceof AuthError) return fail(400, { name, error: e.code });
			throw e;
		}
		redirect(303, '/');
	}
};
