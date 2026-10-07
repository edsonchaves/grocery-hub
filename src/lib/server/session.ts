import { error, type Cookies } from '@sveltejs/kit';
import { createSession, SESSION_COOKIE } from './auth';
import type { Db } from './db';
import { config } from './config';

const publicUrl = config.publicUrl ? new URL(config.publicUrl) : undefined;

// adapter-node reports https for every request without a proxy header, so judge by host:
// Secure only on the HTTPS public URL, otherwise plain-http LAN/dev logins would never stick
export const secureCookie = (url: URL) =>
	publicUrl?.protocol === 'https:' && url.host === publicUrl.host;

export function setSessionCookie(cookies: Cookies, url: URL, token: string, expires: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie(url),
		expires
	});
}

export function startSession(db: Db, cookies: Cookies, url: URL, userId: number) {
	const { token, expiresAt } = createSession(db, userId);
	setSessionCookie(cookies, url, token, expiresAt);
}

/** The guard in hooks already rejected anonymous requests; this narrows the type. */
export function requireUser(locals: App.Locals) {
	if (!locals.user) error(401, 'unauthorized');
	return locals.user;
}

export const intParam = (v: string | null | undefined) => {
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) error(400, 'bad id');
	return n;
};
