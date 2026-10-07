import { json, redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/db/index.ts';
import { hasUsers, SESSION_COOKIE, validateSession } from '#lib/server/auth.ts';
import { resolveLocale } from '#lib/i18n/index.ts';
import { config } from '#lib/server/config.ts';
import { setSessionCookie } from '#lib/server/session.ts';

export const init: ServerInit = () => {
	getDb();
};

const PUBLIC = new Set(['/login', '/setup', '/api/health', '/api/widget']);
const isPublic = (path: string) => PUBLIC.has(path) || path.startsWith('/invite/');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const publicHost = config.publicUrl ? new URL(config.publicUrl).host : undefined;

function crossSite(request: Request) {
	if (SAFE_METHODS.has(request.method)) return false;
	const origin = request.headers.get('origin');
	if (!origin) return false;
	let host: string;
	try {
		host = new URL(origin).host;
	} catch {
		return true;
	}
	return host !== request.headers.get('host') && host !== publicHost;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { cookies, url, request } = event;
	if (crossSite(request)) return new Response('Cross-site request forbidden', { status: 403 });
	const db = getDb();

	event.locals.user = null;
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		const session = validateSession(db, token);
		if (session) {
			event.locals.user = session.user;
			if (session.renewedUntil) {
				setSessionCookie(cookies, url, token, session.renewedUntil);
			}
		} else {
			cookies.delete(SESSION_COOKIE, { path: '/', secure: false });
		}
	}
	event.locals.locale = resolveLocale(
		event.locals.user?.locale,
		request.headers.get('accept-language')
	);

	const path = url.pathname;
	if (!event.locals.user && !isPublic(path)) {
		if (path.startsWith('/api/')) return json({ error: 'unauthorized' }, { status: 401 });
		redirect(303, hasUsers(db) ? '/login' : '/setup');
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};
