import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { config } from '#lib/server/config.ts';
import { listReceipts, processReceipt, storeUpload } from '#lib/server/receipts/service.ts';
import { requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => ({
	receipts: listReceipts(getDb(), requireUser(locals).householdId).map((r) => ({
		...r,
		createdAt: r.createdAt.getTime()
	})),
	visionEnabled: !!config.anthropicApiKey
});

export const actions: Actions = {
	upload: async ({ locals, request }) => {
		const user = requireUser(locals);
		const files = (await request.formData())
			.getAll('files')
			.filter((f): f is File => f instanceof File);
		if (!files.some((f) => f.size > 0)) return fail(400);
		const db = getDb();
		const id = await storeUpload(db, user.householdId, user.id, files);
		// parse in the background; the review page polls the status
		void processReceipt(db, id);
		redirect(303, `/receipts/${id}`);
	}
};
