import { openDb } from '../db';
import { setupHousehold } from '../auth';

export const testDb = () => openDb(':memory:', './drizzle');

export async function testHousehold() {
	const db = testDb();
	const admin = await setupHousehold(db, {
		household: 'Test',
		name: 'Ana',
		password: 'password1',
		locale: 'pt'
	});
	return { db, admin, hh: admin.householdId };
}
