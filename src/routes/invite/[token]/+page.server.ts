import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { acceptInvite, AuthError, findInvite } from '#lib/server/auth.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ params }: PageServerLoadEvent) => ({
	valid: !!findInvite(getDb(), params.token)
});

export const actions: Actions = {
	default: async ({ request, params, cookies, url, locals }) => {
		const db = getDb();
		const f = await request.formData();
		const name = String(f.get('name') ?? '');
		try {
			const user = await acceptInvite(db, params.token, {
				name,
				password: String(f.get('password') ?? ''),
				locale: locals.locale
			});
			startSession(db, cookies, url, user.id);
		} catch (e) {
			if (e instanceof AuthError) {
				const error = e.code === 'inviteInvalid' ? 'invite.invalid' : `auth.${e.code}`;
				return fail(400, { name, error });
			}
			throw e;
		}
		redirect(303, '/');
	}
};
