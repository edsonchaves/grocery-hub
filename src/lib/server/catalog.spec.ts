import { describe, expect, it } from 'vitest';
import {
	createCategory,
	createProduct,
	deleteCategory,
	getProduct,
	listCategories,
	mergeProducts,
	moveCategory,
	normalizeReceiptName,
	searchProducts,
	similarity,
	updateProduct
} from './catalog';
import { addItem, listView } from './list';
import { getStatus, setStatus } from './pantry';
import { savePurchase } from './receipts/service';
import { aliasProductId } from './receipts/matching';
import { priceHistory } from './insights';
import { testHousehold } from './test/db';
import { receipts, stores } from './db/schema';

describe('product-catalog', () => {
	it('normalizes receipt names', () => {
		expect(normalizeReceiptName('BIO VOLLMILCH 3,8%')).toBe('BIO VOLLMILCH');
		expect(normalizeReceiptName('Mineralwasser 1,5L')).toBe('MINERALWASSER');
		expect(normalizeReceiptName('Joghurt 4x125g')).toBe('JOGHURT');
	});

	it('ranks similar names', () => {
		expect(similarity('BIO VOLLMILCH', 'Milch')).toBeGreaterThan(
			similarity('BIO VOLLMILCH', 'Mehl')
		);
	});

	it('edit product applies everywhere it is referenced', async () => {
		const { db, admin, hh } = await testHousehold();
		const p = createProduct(db, hh, { name: 'Milch' });
		addItem(db, hh, admin.id, { productId: p.id });
		const dairy = listCategories(db, hh)[2];
		updateProduct(db, hh, p.id, { name: 'Vollmilch', categoryId: dairy.id });
		expect(listView(db, hh)[0]).toMatchObject({ name: 'Vollmilch', categoryName: dairy.name });
	});

	it('merge moves aliases, purchases, list entries and pantry to the target', async () => {
		const { db, admin, hh } = await testHousehold();
		const milch = createProduct(db, hh, { name: 'Milch' });
		const voll = createProduct(db, hh, { name: 'Vollmilch' });
		const r = db
			.insert(receipts)
			.values({ householdId: hh, kind: 'pdf', files: [] })
			.returning()
			.get();
		savePurchase(
			db,
			hh,
			admin.id,
			{
				store: 'REWE',
				purchasedAt: '2026-10-01T10:00',
				totalCents: 119,
				lines: [{ rawName: 'VOLLMILCH 3,5%', productId: voll.id, lineCents: 119 }]
			},
			r.id
		);
		addItem(db, hh, admin.id, { productId: voll.id });
		setStatus(db, hh, admin.id, voll.id, 'low');

		mergeProducts(db, hh, voll.id, milch.id);

		expect(getProduct(db, hh, voll.id)).toBeUndefined();
		const rewe = db.select().from(stores).get()!;
		expect(aliasProductId(db, hh, rewe.id, 'VOLLMILCH 3,5%')).toBe(milch.id);
		expect(priceHistory(db, hh, milch.id).points).toHaveLength(1);
		expect(listView(db, hh)).toMatchObject([{ productId: milch.id, name: 'Milch' }]);
		expect(getStatus(db, milch.id)?.status).toBe('low');
	});

	it('search finds products by partial, case-insensitive name', async () => {
		const { db, hh } = await testHousehold();
		createProduct(db, hh, { name: 'Milch' });
		createProduct(db, hh, { name: 'Hafermilch' });
		createProduct(db, hh, { name: 'Brot' });
		expect(searchProducts(db, hh, 'milch').map((p) => p.name)).toEqual(['Milch', 'Hafermilch']);
	});

	it('deleting a category in use makes its products uncategorized', async () => {
		const { db, hh } = await testHousehold();
		const c = createCategory(db, hh, 'Snacks');
		const p = createProduct(db, hh, { name: 'Chips', categoryId: c.id });
		deleteCategory(db, hh, c.id);
		expect(getProduct(db, hh, p.id)?.categoryId).toBeNull();
	});

	it('reorders categories', async () => {
		const { db, hh } = await testHousehold();
		const [first, second] = listCategories(db, hh);
		moveCategory(db, hh, second.id, -1);
		expect(
			listCategories(db, hh)
				.slice(0, 2)
				.map((c) => c.id)
		).toEqual([second.id, first.id]);
	});
});
