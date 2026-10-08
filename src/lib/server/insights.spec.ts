import { describe, expect, it } from 'vitest';
import { createProduct, listCategories, updateProduct } from './catalog';
import { addItem } from './list';
import { basketEstimate, cheapestStore, monthlyOverview, priceHistory } from './insights';
import { savePurchase } from './receipts/service';
import { testHousehold } from './test/db';

describe('spending-insights', () => {
	it('month overview with deltas and breakdowns', async () => {
		const { db, admin, hh } = await testHousehold();
		const dairy = listCategories(db, hh)[2];
		const butter = createProduct(db, hh, { name: 'Butter' });
		updateProduct(db, hh, butter.id, { categoryId: dairy.id });
		const buy = (
			store: string,
			date: string,
			total: number,
			lines = [] as {
				rawName: string;
				productId?: number;
				lineCents: number;
				kind?: 'item' | 'pfand' | 'discount' | 'fee';
			}[]
		) => savePurchase(db, hh, admin.id, { store, purchasedAt: date, totalCents: total, lines });

		buy('REWE', '2026-05-10T10:00', 6000);
		buy('REWE', '2026-09-10T10:00', 4000);
		buy('REWE', '2026-10-02T10:00', 474, [
			{ rawName: 'BUTTER', productId: butter.id, lineCents: 249 },
			{ rawName: 'PFAND', lineCents: 25, kind: 'pfand' },
			{ rawName: 'TÜTE', lineCents: 200 }
		]);
		buy('Wochenmarkt', '2026-10-05', 1200);

		const o = monthlyOverview(db, hh, 2026, 10);
		expect(o.total).toBe(1674);
		expect(o.deltaPrev).toBe(1674 - 4000);
		expect(o.sixMonthAvg).toBe(Math.round(10000 / 6));
		expect(o.byStore).toEqual([
			{ key: 'Wochenmarkt', label: 'Wochenmarkt', cents: 1200 },
			{ key: 'REWE', label: 'REWE', cents: 474 }
		]);
		const cat = Object.fromEntries(o.byCategory.map((c) => [c.key, c.cents]));
		expect(cat).toEqual({ uncategorized: 1400, [`c${dairy.id}`]: 249, pfand: 25 });
	});

	it('shows order discounts and fees as their own buckets', async () => {
		const { db, admin, hh } = await testHousehold();
		const dairy = listCategories(db, hh)[2];
		const butter = createProduct(db, hh, { name: 'Butter' });
		updateProduct(db, hh, butter.id, { categoryId: dairy.id });
		savePurchase(db, hh, admin.id, {
			store: 'REWE online',
			purchasedAt: '2026-10-07T00:00',
			totalCents: 2490,
			lines: [
				{ rawName: 'Butter', productId: butter.id, lineCents: 2700 },
				{ rawName: 'Summe Rabatt Gesamtpositionen**', lineCents: -600, kind: 'discount' },
				{ rawName: 'Liefergebühr', lineCents: 390, kind: 'fee' }
			]
		});
		const cat = Object.fromEntries(
			monthlyOverview(db, hh, 2026, 10).byCategory.map((c) => [c.key, c.cents])
		);
		expect(cat).toEqual({ [`c${dairy.id}`]: 2700, discount: -600, fee: 390 });
	});

	it('price history and cheapest store', async () => {
		const { db, admin, hh } = await testHousehold();
		const butter = createProduct(db, hh, { name: 'Butter' });
		const now = new Date('2026-10-07T12:00').getTime();
		for (const [store, date, cents] of [
			['REWE', '2026-08-01T10:00', 229],
			['REWE', '2026-09-20T10:00', 249],
			['Lidl', '2026-09-25T10:00', 199]
		] as const) {
			savePurchase(db, hh, admin.id, {
				store,
				purchasedAt: date,
				totalCents: cents,
				lines: [{ rawName: 'BUTTER', productId: butter.id, lineCents: cents }]
			});
		}
		const h = priceHistory(db, hh, butter.id);
		expect(h.points.map((p) => [p.store, p.unitCents])).toEqual([
			['REWE', 229],
			['REWE', 249],
			['Lidl', 199]
		]);
		expect(h.stats).toEqual({ latest: 199, min: 199, avg: 226 });
		expect(cheapestStore(db, hh, butter.id, now)).toEqual({
			store: 'Lidl',
			unitCents: 199,
			diffCents: 50
		});

		addItem(db, hh, admin.id, { productId: butter.id, qty: '2' });
		addItem(db, hh, admin.id, { text: 'Neu' });
		expect(basketEstimate(db, hh, now)).toEqual([
			{ store: 'Lidl', totalCents: 398, priced: 1, missing: 1 },
			{ store: 'REWE', totalCents: 498, priced: 1, missing: 1 }
		]);
	});
});
