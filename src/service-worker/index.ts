import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `gh-${version}`;
const PRECACHE = [...immutable, ...assets].map((f) => f.path);
const precached = new Set(PRECACHE);

// pages and the list endpoint: network first, last good copy when offline (read-only)
const OFFLINE_READ = (url: URL) =>
	url.pathname === '/' || url.pathname === '/pantry' || url.pathname === '/api/list';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	if (precached.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(req)));
		return;
	}
	if (OFFLINE_READ(url) || req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					if (res.ok && OFFLINE_READ(url)) {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(req, copy));
					}
					return res;
				})
				.catch(
					async () => (await caches.match(req)) ?? (await caches.match('/')) ?? Response.error()
				)
		);
	}
});
