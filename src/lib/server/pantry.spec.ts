import { describe, expect, it } from 'vitest';
import { createProduct } from './catalog';
import { listView } from './list';
import { getStatus, pantryView, setStatus } from './pantry';
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
