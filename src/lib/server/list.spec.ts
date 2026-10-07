import { describe, expect, it } from 'vitest';
import { addItem, clearChecked, listView, setChecked, sortList } from './list';
import { createProduct, listCategories, searchProducts, updateProduct } from './catalog';
import { getStatus } from './pantry';
import { subscribe, type ListEvent } from './events';
import { testHousehold } from './test/db';

describe('shopping-list', () => {
	it('adds a known product', async () => {
		const { db, admin, hh } = await testHousehold();
		const milch = createProduct(db, hh, { name: 'Milch' });
		const [hit] = searchProducts(db, hh, 'milch');
		expect(hit.id).toBe(milch.id);
		const { item } = addItem(db, hh, admin.id, { productId: hit.id });
		expect(item).toMatchObject({ productId: milch.id, name: 'Milch', checked: false });
	});

	it('unknown text becomes a new uncategorized product', async () => {
		const { db, admin, hh } = await testHousehold();
		const { item } = addItem(db, hh, admin.id, { text: 'Kokosmilch' });
		expect(item.productId).not.toBeNull();
		expect(item.categoryId).toBeNull();
		expect(searchProducts(db, hh, 'kokosmilch')[0].name).toBe('Kokosmilch');
	});

	it('does not duplicate an open entry', async () => {
		const { db, admin, hh } = await testHousehold();
		const first = addItem(db, hh, admin.id, { text: 'Brot' });
		const again = addItem(db, hh, admin.id, { text: 'brot' });
		expect(again.duplicate).toBe(true);
		expect(again.item.id).toBe(first.item.id);
		expect(listView(db, hh)).toHaveLength(1);
	});

	it('check-off moves item to the bottom and restocks the pantry', async () => {
		const { db, admin, hh } = await testHousehold();
		const a = addItem(db, hh, admin.id, { text: 'Apfel' }).item;
		addItem(db, hh, admin.id, { text: 'Zucker' });
		setChecked(db, hh, a.id, true);
		const sorted = sortList(listView(db, hh));
		expect(sorted.at(-1)).toMatchObject({ id: a.id, checked: true });
		expect(getStatus(db, a.productId!)?.status).toBe('in_stock');
	});

	it('clear checked removes only checked items', async () => {
		const { db, admin, hh } = await testHousehold();
		const a = addItem(db, hh, admin.id, { text: 'A' }).item;
		addItem(db, hh, admin.id, { text: 'B' });
		setChecked(db, hh, a.id, true);
		clearChecked(db, hh);
		expect(listView(db, hh).map((i) => i.name)).toEqual(['B']);
	});

	it('groups by category order, uncategorized last', async () => {
		const { db, admin, hh } = await testHousehold();
		const [produce, , dairy, , frozen] = listCategories(db, hh);
		for (const [name, cat] of [
			['Pizza', frozen],
			['Joghurt', dairy],
			['Batteries', null],
			['Tomate', produce]
		] as const) {
			const p = createProduct(db, hh, { name });
			if (cat) updateProduct(db, hh, p.id, { categoryId: cat.id });
			addItem(db, hh, admin.id, { productId: p.id });
		}
		expect(sortList(listView(db, hh)).map((i) => i.name)).toEqual([
			'Tomate',
			'Joghurt',
			'Pizza',
			'Batteries'
		]);
	});

	it('broadcasts changes to other members of the household', async () => {
		const { db, admin, hh } = await testHousehold();
		const events: ListEvent[] = [];
		const off = subscribe(hh, (e) => events.push(e));
		const { item } = addItem(db, hh, admin.id, { text: 'Kaffee' });
		setChecked(db, hh, item.id, true);
		off();
		expect(events.map((e) => e.type)).toEqual(['upsert', 'upsert']);
		expect(events[1]).toMatchObject({ items: [{ id: item.id, checked: true }] });
	});
});
