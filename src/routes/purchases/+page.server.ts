import { getDb } from '#lib/server/db/index.ts';
import { deletePurchase, listPurchases } from '#lib/server/receipts/service.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = ({ locals }: PageServerLoadEvent) => ({
	purchases: listPurchases(getDb(), requireUser(locals).householdId, 100).map((p) => ({
		...p,
		purchasedAt: p.purchasedAt.getTime()
	}))
});

export const actions: Actions = {
	delete: async ({ locals, request }) => {
		const user = requireUser(locals);
		deletePurchase(
			getDb(),
			user.householdId,
			intParam((await request.formData()).get('id') as string)
		);
	}
};
