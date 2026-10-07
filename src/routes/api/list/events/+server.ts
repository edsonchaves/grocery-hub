import { subscribe } from '#lib/server/events.ts';
import { requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, request }) => {
	const user = requireUser(locals);
	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			const off = subscribe(user.householdId, (e) => send(`data: ${JSON.stringify(e)}\n\n`));
			// comment lines keep proxies from closing an idle connection
			const ping = setInterval(() => send(': ping\n\n'), 25_000);
			cleanup = () => {
				off();
				clearInterval(ping);
			};
			request.signal.addEventListener('abort', () => {
				cleanup();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			});
			send('retry: 2000\n: connected\n\n');
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			'x-accel-buffering': 'no'
		}
	});
};
