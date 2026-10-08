import { describe, expect, it } from 'vitest';
import { createProduct } from './catalog';
import { addItem, listView } from './list';
import { addEntry, createWeek, findOrCreateDish, setIngredient } from './meals';
import { getStatus, setStatus } from './pantry';
import { savePurchase } from './receipts/service';
import { DAY } from './restock';
import { testHousehold } from './test/db';
import { confirmShopping, prepareShopping } from './weekly-shopping';

const NOW = new Date('2026-10-10T12:00').getTime();
const at = (daysAgo: number) => {
	const d = new Date(NOW - daysAgo * DAY);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:00`;
};

async function setup() {
	const h = await testHousehold();
	const week = createWeek(h.db, h.hh, '2026-10-11');
	const dish = (name: string, date = '2026-10-12') =>
		addEntry(h.db, h.hh, week.id, {
			date,
			kind: 'dish',
			dishId: findOrCreateDish(h.db, h.hh, name).id
		}).dishId!;
	const buy = (store: string, daysAgo: number, productIds: number[]) =>
		savePurchase(h.db, h.hh, h.admin.id, {
			store,
			purchasedAt: at(daysAgo),
			totalCents: 100 * productIds.length,
			lines: productIds.map((productId) => ({
				rawName: `p${productId}`,
				productId,
				lineCents: 100
			}))
		});
	const prepare = () => prepareShopping(h.db, h.hh, week.id, NOW);
	const find = (name: string) => prepare().candidates.find((c) => c.name === name);
	return { ...h, week, dish, buy, prepare, find };
}

describe('weekly-shopping', () => {
	it('sums ingredients of the week per product with dish notes', async () => {
		const { db, hh, dish, find } = await setup();
		setIngredient(db, hh, dish('Strogonoff'), { text: 'Frango', qty: 400, unit: 'g' });
		setIngredient(db, hh, dish('Chili', '2026-10-13'), { text: 'Frango', qty: 500, unit: 'g' });
		expect(find('Frango')).toMatchObject({ qty: '900 g', dishes: ['Strogonoff', 'Chili'] });
	});

	it('converts units when summing', async () => {
		const { db, hh, dish, find } = await setup();
		setIngredient(db, hh, dish('Bolo'), { text: 'Mehl', qty: 500, unit: 'g' });
		setIngredient(db, hh, dish('Pão'), { text: 'Mehl', qty: 1, unit: 'kg' });
		expect(find('Mehl')?.qty).toBe('1,5 kg');
	});

	it('includes restocks due by the end of the week', async () => {
		const { db, hh, buy, find } = await setup();
		const milch = createProduct(db, hh, { name: 'Milch' });
		for (const d of [17, 10, 3]) buy('REWE', d, [milch.id]);
		// 7-day interval, bought 3 days ago: not due today, due before the week ends
		expect(find('Milch')).toMatchObject({ restock: true, dishes: [] });
	});

	it('adds nothing for leftovers', async () => {
		const { db, hh, week, prepare } = await setup();
		addEntry(db, hh, week.id, { date: '2026-10-14', kind: 'leftovers' });
		expect(prepare().candidates).toEqual([]);
	});

	it('classifies against the pantry and the list', async () => {
		const { db, hh, admin, dish, buy, find } = await setup();
		const strogonoff = dish('Strogonoff');
		const reis = setIngredient(db, hh, strogonoff, { text: 'Reis' });
		const alho = setIngredient(db, hh, strogonoff, { text: 'Alho' });
		setIngredient(db, hh, strogonoff, { text: 'Polvilho' });
		const frango = setIngredient(db, hh, strogonoff, { text: 'Frango' });
		const creme = setIngredient(db, hh, strogonoff, { text: 'Creme de leite' });
		setStatus(db, hh, null, reis, 'in_stock');
		for (const d of [17, 10, 3]) buy('REWE', d, [alho]);
		addItem(db, hh, admin.id, { productId: frango });
		setStatus(db, hh, null, creme, 'low');

		expect(find('Reis')?.state).toBe('have');
		expect(find('Alho')?.state).toBe('ask');
		expect(find('Polvilho')?.state).toBe('ask');
		expect(find('Frango')?.state).toBe('on_list');
		expect(find('Creme de leite')?.state).toBe('need');
	});

	it('adds needed items and "no" answers, records "yes" answers', async () => {
		const { db, hh, admin, week, dish, buy, find } = await setup();
		const strogonoff = dish('Strogonoff');
		const reis = setIngredient(db, hh, strogonoff, { text: 'Reis' });
		const alho = setIngredient(db, hh, strogonoff, { text: 'Alho' });
		const polvilho = setIngredient(db, hh, strogonoff, { text: 'Polvilho', qty: 500, unit: 'g' });
		const frango = setIngredient(db, hh, strogonoff, { text: 'Frango' });
		setStatus(db, hh, null, reis, 'in_stock');
		for (const d of [17, 10, 3]) buy('REWE', d, [alho]);
		addItem(db, hh, admin.id, { productId: frango });

		const { added } = confirmShopping(
			db,
			hh,
			admin.id,
			week.id,
			{ add: [polvilho, reis, frango], have: [alho] },
			NOW
		);
		expect(added).toBe(2);
		expect(getStatus(db, alho)?.status).toBe('in_stock');
		expect(getStatus(db, polvilho)?.status).toBe('out');
		const list = listView(db, hh);
		expect(list.filter((i) => i.name === 'Frango')).toHaveLength(1);
		expect(list.find((i) => i.name === 'Polvilho')).toMatchObject({
			qty: '500 g',
			note: 'p/ Strogonoff'
		});
		expect(list.some((i) => i.name === 'Reis')).toBe(true);
		expect(list.some((i) => i.name === 'Alho')).toBe(false);
		expect(find('Polvilho')?.state).toBe('on_list');
	});

	it('separates items usually bought outside the main store', async () => {
		const { db, hh, admin, week, dish, buy, prepare } = await setup();
		const paoDeQueijo = dish('Pão de queijo');
		const polvilho = setIngredient(db, hh, paoDeQueijo, { text: 'Polvilho' });
		const ovos = setIngredient(db, hh, paoDeQueijo, { text: 'Ovos' });
		const queijo = setIngredient(db, hh, paoDeQueijo, { text: 'Queijo' });
		buy('REWE online', 20, [ovos]);
		buy('REWE online', 6, [ovos]);
		buy('Amazon', 30, [polvilho]);
		setStatus(db, hh, null, polvilho, 'low');

		const { candidates, mainStore } = prepare();
		expect(mainStore).toBe('REWE online');
		expect(candidates.find((c) => c.productId === polvilho)).toMatchObject({
			store: 'Amazon',
			elsewhere: true
		});
		expect(candidates.find((c) => c.productId === queijo)).toMatchObject({
			store: null,
			elsewhere: false
		});
		expect(candidates.at(-1)?.productId).toBe(polvilho);

		confirmShopping(db, hh, admin.id, week.id, { add: [polvilho], have: [] }, NOW);
		expect(listView(db, hh).find((i) => i.name === 'Polvilho')?.note).toBe(
			'p/ Pão de queijo · Amazon'
		);
	});
});
