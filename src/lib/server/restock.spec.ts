import { describe, expect, it } from 'vitest';
import { createProduct } from './catalog';
import { addItem } from './list';
import { savePurchase } from './receipts/service';
import { DAY, dismissSuggestion, dueProducts, medianIntervalDays } from './restock';
import { testHousehold } from './test/db';

const day0 = new Date('2026-06-01T10:00').getTime();
const at = (d: number) => day0 + d * DAY;
const iso = (t: number) => {
	const d = new Date(t);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function withKaffee(days: number[]) {
	const ctx = await testHousehold();
	const kaffee = createProduct(ctx.db, ctx.hh, { name: 'Kaffee' });
	for (const d of days) {
		savePurchase(ctx.db, ctx.hh, ctx.admin.id, {
			store: 'REWE',
			purchasedAt: iso(at(d)),
			totalCents: 699 + d,
			lines: [{ rawName: 'KAFFEE', productId: kaffee.id, lineCents: 699 + d }]
		});
	}
	return { ...ctx, kaffee };
}

describe('restock-suggestions', () => {
	it('estimates the median interval', () => {
		expect(medianIntervalDays([0, 14, 29, 43].map(at))).toBe(14);
	});

	it('needs at least 3 purchases', async () => {
		expect(medianIntervalDays([0, 14].map(at))).toBeUndefined();
		const { db, hh } = await withKaffee([0, 14]);
		expect(dueProducts(db, hh, at(60))).toEqual([]);
	});

	it('suggests a product at 85% of its interval', async () => {
		const { db, hh, kaffee } = await withKaffee([0, 14, 29, 43]);
		expect(dueProducts(db, hh, at(43 + 11))).toEqual([]);
		expect(dueProducts(db, hh, at(43 + 12))).toMatchObject([
			{ productId: kaffee.id, name: 'Kaffee' }
		]);
	});

	it('skips products already on the list', async () => {
		const { db, admin, hh, kaffee } = await withKaffee([0, 14, 29, 43]);
		addItem(db, hh, admin.id, { productId: kaffee.id });
		expect(dueProducts(db, hh, at(56))).toEqual([]);
	});

	it('dismissal holds until one more interval passes', async () => {
		const { db, hh, kaffee } = await withKaffee([0, 14, 29, 43]);
		dismissSuggestion(db, hh, kaffee.id, at(56));
		expect(dueProducts(db, hh, at(60))).toEqual([]);
		expect(dueProducts(db, hh, at(56 + 14))).toHaveLength(1);
	});
});
