import { describe, expect, it } from 'vitest';
import { createProduct, findProductByName, mergeProducts } from './catalog';
import { listView } from './list';
import {
	WeekOverlap,
	addEntry,
	addMissingToList,
	copyPreviousWeek,
	createWeek,
	findOrCreateDish,
	getDish,
	missingForCurrentWeek,
	nextWeekStart,
	setIngredient,
	weekView
} from './meals';
import { setStatus } from './pantry';
import { testHousehold } from './test/db';

describe('meal-planning', () => {
	it('creates a dish while planning and shows it on its day', async () => {
		const { db, hh } = await testHousehold();
		const week = createWeek(db, hh, '2026-10-11');
		const entry = addEntry(db, hh, week.id, {
			date: '2026-10-12',
			kind: 'dish',
			dishName: 'Strogonoff'
		});
		setIngredient(db, hh, entry.dishId!, { text: 'Frango', qty: 400, unit: 'g' });
		setIngredient(db, hh, entry.dishId!, { text: 'Creme de leite' });
		setIngredient(db, hh, entry.dishId!, { text: 'Champignon' });

		expect(getDish(db, hh, entry.dishId!).ingredients.map((i) => [i.name, i.qty, i.unit])).toEqual([
			['Frango', 400, 'g'],
			['Creme de leite', null, null],
			['Champignon', null, null]
		]);
		const view = weekView(db, hh, '2026-10-11')!;
		expect(view.days[1].entries.map((e) => e.name)).toEqual(['Strogonoff']);
	});

	it('creates an uncategorized product for an unknown ingredient', async () => {
		const { db, hh } = await testHousehold();
		const dish = findOrCreateDish(db, hh, 'Pão de queijo');
		setIngredient(db, hh, dish.id, { text: 'Polvilho' });
		expect(findProductByName(db, hh, 'Polvilho')).toMatchObject({ categoryId: null });
	});

	it('edits a dish once for every week that plans it', async () => {
		const { db, hh } = await testHousehold();
		const dish = findOrCreateDish(db, hh, 'Strogonoff');
		for (const start of ['2026-10-11', '2026-10-18']) {
			const w = createWeek(db, hh, start);
			addEntry(db, hh, w.id, { date: start, kind: 'dish', dishId: dish.id });
		}
		setIngredient(db, hh, dish.id, { text: 'Batata palha' });
		for (const start of ['2026-10-11', '2026-10-18']) {
			const dishId = weekView(db, hh, start)!.days[0].entries[0].dishId!;
			expect(getDish(db, hh, dishId).ingredients.map((i) => i.name)).toEqual(['Batata palha']);
		}
	});

	it('plans a week with days, whole-week items and leftovers', async () => {
		const { db, hh } = await testHousehold();
		const week = createWeek(db, hh, '2026-10-11');
		addEntry(db, hh, week.id, { date: '2026-10-11', kind: 'dish', dishName: 'Churrasco' });
		addEntry(db, hh, week.id, { date: '2026-10-12', kind: 'dish', dishName: 'Strogonoff' });
		addEntry(db, hh, week.id, { date: '2026-10-12', kind: 'dish', dishName: 'Pão de queijo' });
		addEntry(db, hh, week.id, { date: null, kind: 'product', text: 'Iogurte' });
		addEntry(db, hh, week.id, { date: null, kind: 'product', text: 'Pão', qty: 2 });
		addEntry(db, hh, week.id, { date: '2026-10-14', kind: 'leftovers' });

		const view = weekView(db, hh, '2026-10-11')!;
		expect(view.endDate).toBe('2026-10-17');
		expect(view.days.map((d) => d.date)).toEqual([
			'2026-10-11',
			'2026-10-12',
			'2026-10-13',
			'2026-10-14',
			'2026-10-15',
			'2026-10-16',
			'2026-10-17'
		]);
		expect(view.days[1].entries.map((e) => e.name)).toEqual(['Strogonoff', 'Pão de queijo']);
		expect(view.wholeWeek.map((e) => [e.name, e.qty])).toEqual([
			['Iogurte', ''],
			['Pão', '2']
		]);
		expect(view.days[3].entries).toMatchObject([{ kind: 'leftovers', name: null }]);
		expect(() => addEntry(db, hh, week.id, { date: '2026-10-18', kind: 'leftovers' })).toThrow();
	});

	it('starts the next week after the latest one, never in the past', async () => {
		const { db, hh } = await testHousehold();
		expect(nextWeekStart(db, hh, '2026-10-09')).toBe('2026-10-09');
		createWeek(db, hh, '2026-10-11');
		expect(nextWeekStart(db, hh, '2026-10-12')).toBe('2026-10-18');
		expect(nextWeekStart(db, hh, '2026-11-02')).toBe('2026-11-02');
	});

	it('rejects overlapping weeks', async () => {
		const { db, hh } = await testHousehold();
		createWeek(db, hh, '2026-10-11');
		expect(() => createWeek(db, hh, '2026-10-14')).toThrow(WeekOverlap);
		expect(() => createWeek(db, hh, '2026-10-05')).toThrow(WeekOverlap);
		expect(createWeek(db, hh, '2026-10-18').startDate).toBe('2026-10-18');
	});

	it('copies the previous week into an empty week only', async () => {
		const { db, hh } = await testHousehold();
		const first = createWeek(db, hh, '2026-10-11');
		addEntry(db, hh, first.id, { date: '2026-10-12', kind: 'dish', dishName: 'Strogonoff' });
		addEntry(db, hh, first.id, { date: null, kind: 'product', text: 'Iogurte' });
		const second = createWeek(db, hh, '2026-10-18');

		expect(copyPreviousWeek(db, hh, second.id)).toBe(true);
		const view = weekView(db, hh, '2026-10-18')!;
		expect(view.days[1]).toMatchObject({ date: '2026-10-19', entries: [{ name: 'Strogonoff' }] });
		expect(view.wholeWeek.map((e) => e.name)).toEqual(['Iogurte']);

		expect(copyPreviousWeek(db, hh, second.id)).toBe(false);
		expect(weekView(db, hh, '2026-10-18')!.wholeWeek).toHaveLength(1);
	});

	it('warns about missing ingredients only in the current week', async () => {
		const { db, admin, hh } = await testHousehold();
		const dish = findOrCreateDish(db, hh, 'Lasanha');
		const ricota = setIngredient(db, hh, dish.id, { text: 'Ricota', qty: 250, unit: 'g' });
		const massa = setIngredient(db, hh, dish.id, { text: 'Massa de lasanha' });
		setStatus(db, hh, null, massa, 'in_stock');
		const current = createWeek(db, hh, '2026-10-11');
		const next = createWeek(db, hh, '2026-10-18');

		const missing = missingForCurrentWeek(db, hh, current.id, dish.id, '2026-10-15');
		expect(missing.map((m) => m.name)).toEqual(['Ricota']);
		expect(missingForCurrentWeek(db, hh, next.id, dish.id, '2026-10-15')).toEqual([]);

		addMissingToList(db, hh, admin.id, dish.id, [ricota]);
		expect(listView(db, hh)).toMatchObject([{ name: 'Ricota', qty: '250 g', note: 'p/ Lasanha' }]);
		expect(missingForCurrentWeek(db, hh, current.id, dish.id, '2026-10-15')).toEqual([]);
	});

	it('moves ingredients and plan entries when products are merged', async () => {
		const { db, hh } = await testHousehold();
		const dish = findOrCreateDish(db, hh, 'Chili');
		const a = setIngredient(db, hh, dish.id, { text: 'Kidney Bohnen' });
		const b = createProduct(db, hh, { name: 'Kidneybohnen' });
		const week = createWeek(db, hh, '2026-10-11');
		addEntry(db, hh, week.id, { date: null, kind: 'product', productId: a });

		mergeProducts(db, hh, a, b.id);
		expect(getDish(db, hh, dish.id).ingredients.map((i) => i.productId)).toEqual([b.id]);
		expect(weekView(db, hh, '2026-10-11')!.wholeWeek[0].productId).toBe(b.id);
	});
});
