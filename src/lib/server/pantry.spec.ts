import { describe, expect, it } from 'vitest';
import { createProduct } from './catalog';
import { listView } from './list';
import { getStatus, pantryView, setStatus } from './pantry';
import { savePurchase } from './receipts/service';
import { testHousehold } from './test/db';

describe('pantry', () => {
	it('mark running low changes status without adding to the list', async () => {
		const { db, admin, hh } = await testHousehold();
		const reis = createProduct(db, hh, { name: 'Reis' });
		setStatus(db, hh, admin.id, reis.id, 'low');
		expect(getStatus(db, reis.id)?.status).toBe('low');
		expect(listView(db, hh)).toHaveLength(0);
	});

	it('mark out adds to the list once', async () => {
		const { db, admin, hh } = await testHousehold();
		const p = createProduct(db, hh, { name: 'Öl' });
		setStatus(db, hh, admin.id, p.id, 'out');
		setStatus(db, hh, admin.id, p.id, 'out');
		expect(listView(db, hh)).toMatchObject([{ productId: p.id }]);
	});

	it('imported receipt restocks with purchase date', async () => {
		const { db, admin, hh } = await testHousehold();
		const kaffee = createProduct(db, hh, { name: 'Kaffee' });
		setStatus(db, hh, admin.id, kaffee.id, 'out');
		savePurchase(db, hh, admin.id, {
			store: 'REWE',
			purchasedAt: '2026-10-02T17:00',
			totalCents: 699,
			lines: [{ rawName: 'KAFFEE', productId: kaffee.id, lineCents: 699 }]
		});
		expect(getStatus(db, kaffee.id)).toMatchObject({
			status: 'in_stock',
			lastRestockAt: new Date('2026-10-02T17:00')
		});
	});

	it('filters by status', async () => {
		const { db, admin, hh } = await testHousehold();
		const a = createProduct(db, hh, { name: 'A' });
		const b = createProduct(db, hh, { name: 'B' });
		setStatus(db, hh, admin.id, a.id, 'low');
		setStatus(db, hh, admin.id, b.id, 'in_stock');
		expect(pantryView(db, hh, 'low').map((p) => p.name)).toEqual(['A']);
		expect(pantryView(db, hh)).toHaveLength(2);
	});
});
