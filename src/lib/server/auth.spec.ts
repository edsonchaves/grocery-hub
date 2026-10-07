import { describe, expect, it } from 'vitest';
import {
	acceptInvite,
	AuthError,
	checkPassword,
	createInvite,
	createSession,
	hasUsers,
	invalidateSession,
	LoginLimiter,
	SESSION_TTL,
	setLocale,
	setupHousehold,
	validateSession
} from './auth';
import { listCategories } from './catalog';
import { testDb, testHousehold } from './test/db';

const DAY = 86_400_000;

describe('household-auth', () => {
	it('first run creates admin and household with default categories', async () => {
		const db = testDb();
		expect(hasUsers(db)).toBe(false);
		const admin = await setupHousehold(db, {
			household: 'Casa',
			name: 'Ana',
			password: 'password1',
			locale: 'pt'
		});
		expect(admin.isAdmin).toBe(true);
		expect(hasUsers(db)).toBe(true);
		expect(listCategories(db, admin.householdId).map((c) => c.name)).toContain('Laticínios');
		await expect(
			setupHousehold(db, { household: 'x', name: 'Bob', password: 'password1', locale: 'pt' })
		).rejects.toThrow();
	});

	it('admin invite is single-use and valid for 7 days', async () => {
		const { db, admin } = await testHousehold();
		const now = Date.now();
		const token = createInvite(db, { ...admin, locale: 'pt' }, now);
		const member = await acceptInvite(
			db,
			token,
			{ name: 'Bea', password: 'password2', locale: 'de' },
			now + DAY
		);
		expect(member.householdId).toBe(admin.householdId);
		expect(member.isAdmin).toBe(false);
		await expect(
			acceptInvite(db, token, { name: 'Cris', password: 'password3', locale: 'pt' }, now + DAY)
		).rejects.toThrow(AuthError);

		const late = createInvite(db, { ...admin, locale: 'pt' }, now);
		await expect(
			acceptInvite(db, late, { name: 'Dan', password: 'password4', locale: 'pt' }, now + 8 * DAY)
		).rejects.toThrow(AuthError);
	});

	it('only admins create invites', async () => {
		const { db, admin } = await testHousehold();
		expect(() => createInvite(db, { ...admin, isAdmin: false, locale: 'pt' })).toThrow();
	});

	it('returning after 30 days stays logged in and slides expiry', async () => {
		const { db, admin } = await testHousehold();
		const t0 = Date.now();
		const { token } = createSession(db, admin.id, t0);
		const later = t0 + 30 * DAY;
		const v = validateSession(db, token, later);
		expect(v?.user.id).toBe(admin.id);
		expect(v?.renewedUntil?.getTime()).toBe(later + SESSION_TTL);
		expect(validateSession(db, token, later + 89 * DAY)).toBeDefined();

		const idle = createSession(db, admin.id, t0);
		expect(validateSession(db, idle.token, t0 + 91 * DAY)).toBeUndefined();
	});

	it('logout invalidates the session server-side', async () => {
		const { db, admin } = await testHousehold();
		const { token } = createSession(db, admin.id);
		invalidateSession(db, token);
		expect(validateSession(db, token)).toBeUndefined();
	});

	it('checks passwords case-insensitively by name', async () => {
		const { db } = await testHousehold();
		expect(await checkPassword(db, 'ana', 'password1')).toBeDefined();
		expect(await checkPassword(db, 'Ana', 'wrong-pass')).toBeUndefined();
		expect(await checkPassword(db, 'nobody', 'password1')).toBeUndefined();
	});

	it('rate limits repeated failures', () => {
		const l = new LoginLimiter(3, 1000);
		for (let i = 0; i < 3; i++) l.fail('k', 0);
		expect(l.blocked('k', 10)).toBe(true);
		expect(l.blocked('k', 1001)).toBe(false);
	});

	it('stores each member language separately', async () => {
		const { db, admin } = await testHousehold();
		const token = createInvite(db, { ...admin, locale: 'pt' });
		const bea = await acceptInvite(db, token, { name: 'Bea', password: 'password2', locale: 'pt' });
		setLocale(db, bea.id, 'de');
		const s1 = createSession(db, bea.id);
		const s2 = createSession(db, admin.id);
		expect(validateSession(db, s1.token)?.user.locale).toBe('de');
		expect(validateSession(db, s2.token)?.user.locale).toBe('pt');
	});
});
