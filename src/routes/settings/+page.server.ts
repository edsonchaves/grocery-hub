import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '#lib/server/db/index.ts';
import { households, users } from '#lib/server/db/schema.ts';
import { createInvite, invalidateSession, SESSION_COOKIE, setLocale } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { requireUser } from '#lib/server/session.ts';
import { isLocale } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => {
	const user = requireUser(locals);
	const db = getDb();
	const members = db
		.select({ id: users.id, name: users.name, isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.householdId, user.householdId))
		.orderBy(users.name)
		.all();
	const widgetToken = user.isAdmin
		? db.select().from(households).where(eq(households.id, user.householdId)).get()?.widgetToken
		: undefined;
	return { members, widgetToken, userLocale: user.locale };
};

export const actions: Actions = {
	language: async ({ request, locals }) => {
		const user = requireUser(locals);
		const locale = (await request.formData()).get('locale');
		if (!isLocale(locale)) return fail(400);
		setLocale(getDb(), user.id, locale);
	},
	invite: async ({ locals, url }) => {
		const user = requireUser(locals);
		if (!user.isAdmin) error(403, 'forbidden');
		const token = createInvite(getDb(), user);
		const base = config.publicUrl.replace(/\/$/, '') || url.origin;
		return { inviteUrl: `${base}/invite/${token}` };
	},
	logout: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) invalidateSession(getDb(), token);
		cookies.delete(SESSION_COOKIE, { path: '/', secure: false });
		redirect(303, '/login');
	}
};
