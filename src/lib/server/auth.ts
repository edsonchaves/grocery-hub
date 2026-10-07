import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from './db';
import { households, invites, sessions, users } from './db/schema';
import { seedDefaultCategories } from './catalog';
import type { Locale } from '../i18n/locales';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 90 * DAY;
export const INVITE_TTL = 7 * DAY;
export const SESSION_COOKIE = 'gh_session';
export const MIN_PASSWORD = 8;

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AuthError extends Error {
	constructor(public code: 'nameTaken' | 'passwordShort' | 'nameRequired' | 'inviteInvalid') {
		super(code);
	}
}

export type SessionUser = {
	id: number;
	householdId: number;
	name: string;
	isAdmin: boolean;
	locale: Locale;
};

export function hasUsers(db: Db) {
	return !!db.select({ id: users.id }).from(users).limit(1).get();
}

function validate(name: string, password: string) {
	if (!name.trim()) throw new AuthError('nameRequired');
	if (password.length < MIN_PASSWORD) throw new AuthError('passwordShort');
}

function nameTaken(db: Db, name: string) {
	return !!db
		.select({ id: users.id })
		.from(users)
		.where(sql`lower(${users.name}) = lower(${name.trim()})`)
		.get();
}

export async function setupHousehold(
	db: Db,
	input: { household: string; name: string; password: string; locale: Locale }
) {
	validate(input.name, input.password);
	const passwordHash = await hash(input.password);
	return db.transaction((tx) => {
		// re-check inside the transaction: two first visitors must not both become admin
		if (tx.select({ id: users.id }).from(users).limit(1).get()) {
			throw new Error('already set up');
		}
		const household = tx
			.insert(households)
			.values({ name: input.household.trim() || 'Home', widgetToken: newToken() })
			.returning()
			.get();
		seedDefaultCategories(tx, household.id, input.locale);
		return tx
			.insert(users)
			.values({
				householdId: household.id,
				name: input.name.trim(),
				passwordHash,
				isAdmin: true,
				locale: input.locale
			})
			.returning()
			.get();
	});
}

export async function checkPassword(db: Db, name: string, password: string) {
	const user = db
		.select()
		.from(users)
		.where(sql`lower(${users.name}) = lower(${name.trim()})`)
		.get();
	if (!user) {
		// keep timing similar for unknown names
		await hash(password);
		return undefined;
	}
	return (await verify(user.passwordHash, password)) ? user : undefined;
}

export function createSession(db: Db, userId: number, now = Date.now()) {
	const token = newToken();
	const expiresAt = new Date(now + SESSION_TTL);
	db.insert(sessions)
		.values({ id: sha256(token), userId, expiresAt })
		.run();
	return { token, expiresAt };
}

/** Returns the user and, if the expiry was slid forward, the new expiry for the cookie. */
export function validateSession(db: Db, token: string, now = Date.now()) {
	const id = sha256(token);
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return undefined;
	if (row.session.expiresAt.getTime() <= now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return undefined;
	}
	let renewedUntil: Date | undefined;
	// only write when a day has passed, not on every request
	if (row.session.expiresAt.getTime() - now < SESSION_TTL - DAY) {
		renewedUntil = new Date(now + SESSION_TTL);
		db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id)).run();
	}
	const { user } = row;
	const sessionUser: SessionUser = {
		id: user.id,
		householdId: user.householdId,
		name: user.name,
		isAdmin: user.isAdmin,
		locale: user.locale
	};
	return { user: sessionUser, renewedUntil };
}

export function invalidateSession(db: Db, token: string) {
	db.delete(sessions)
		.where(eq(sessions.id, sha256(token)))
		.run();
}

export function createInvite(db: Db, admin: SessionUser, now = Date.now()) {
	if (!admin.isAdmin) throw new Error('forbidden');
	const token = newToken();
	db.insert(invites)
		.values({
			id: sha256(token),
			householdId: admin.householdId,
			createdBy: admin.id,
			expiresAt: new Date(now + INVITE_TTL)
		})
		.run();
	return token;
}

export function findInvite(db: Db, token: string, now = Date.now()) {
	return db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.id, sha256(token)),
				isNull(invites.usedAt),
				gt(invites.expiresAt, new Date(now))
			)
		)
		.get();
}

export async function acceptInvite(
	db: Db,
	token: string,
	input: { name: string; password: string; locale: Locale },
	now = Date.now()
) {
	validate(input.name, input.password);
	const passwordHash = await hash(input.password);
	return db.transaction((tx) => {
		const invite = findInvite(tx, token, now);
		if (!invite) throw new AuthError('inviteInvalid');
		if (nameTaken(tx, input.name)) throw new AuthError('nameTaken');
		tx.update(invites)
			.set({ usedAt: new Date(now) })
			.where(eq(invites.id, invite.id))
			.run();
		return tx
			.insert(users)
			.values({
				householdId: invite.householdId,
				name: input.name.trim(),
				passwordHash,
				locale: input.locale
			})
			.returning()
			.get();
	});
}

export function setLocale(db: Db, userId: number, locale: Locale) {
	db.update(users).set({ locale }).where(eq(users.id, userId)).run();
}

/** Fixed-window limiter for failed logins, keyed by client address + name. */
export class LoginLimiter {
	private hits = new Map<string, { count: number; resetAt: number }>();
	constructor(
		private max = 5,
		private windowMs = 15 * 60 * 1000
	) {}

	blocked(key: string, now = Date.now()) {
		const e = this.hits.get(key);
		return !!e && e.resetAt > now && e.count >= this.max;
	}

	fail(key: string, now = Date.now()) {
		const e = this.hits.get(key);
		if (!e || e.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
		else e.count++;
	}

	reset(key: string) {
		this.hits.delete(key);
	}
}
