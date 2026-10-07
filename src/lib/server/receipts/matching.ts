import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { productAliases } from '../db/schema';
import { findProductByName, normalizeReceiptName, rankProducts } from '../catalog';

export type Match = {
	productId: number | null;
	/** true when an alias decided it, so the member doesn't need to look */
	auto: boolean;
	candidates: { id: number; name: string }[];
	newName: string;
};

export function aliasProductId(db: Db, householdId: number, storeId: number, rawName: string) {
	const normalized = normalizeReceiptName(rawName);
	if (!normalized) return undefined;
	return db
		.select({ productId: productAliases.productId })
		.from(productAliases)
		.where(
			and(
				eq(productAliases.householdId, householdId),
				eq(productAliases.storeId, storeId),
				eq(productAliases.normalizedName, normalized)
			)
		)
		.get()?.productId;
}

export function saveAlias(
	db: Db,
	householdId: number,
	storeId: number,
	rawName: string,
	productId: number
) {
	const normalizedName = normalizeReceiptName(rawName);
	if (!normalizedName) return;
	db.insert(productAliases)
		.values({ householdId, storeId, normalizedName, productId })
		.onConflictDoUpdate({
			target: [productAliases.householdId, productAliases.storeId, productAliases.normalizedName],
			set: { productId }
		})
		.run();
}

const titleCase = (s: string) =>
	normalizeReceiptName(s)
		.toLowerCase()
		.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export function matchLine(
	db: Db,
	householdId: number,
	storeId: number | undefined,
	line: { rawName: string; suggestedName: string | null },
	catalog: { id: number; name: string }[]
): Match {
	const newName = line.suggestedName || titleCase(line.rawName) || line.rawName;
	const aliased = storeId ? aliasProductId(db, householdId, storeId, line.rawName) : undefined;
	if (aliased) {
		const p = catalog.find((c) => c.id === aliased);
		return { productId: aliased, auto: true, candidates: p ? [p] : [], newName };
	}

	const ranked = rankProducts(line.rawName, catalog, 5).map((r) => r.item);
	if (line.suggestedName) {
		const exact = findProductByName(db, householdId, line.suggestedName);
		if (exact) {
			const rest = ranked.filter((r) => r.id !== exact.id);
			return {
				productId: exact.id,
				auto: false,
				candidates: [{ id: exact.id, name: exact.name }, ...rest].slice(0, 5),
				newName
			};
		}
		for (const r of rankProducts(line.suggestedName, catalog, 3).map((x) => x.item)) {
			if (!ranked.some((x) => x.id === r.id)) ranked.push(r);
		}
	}
	const candidates = ranked.map(({ id, name }) => ({ id, name }));
	return { productId: candidates[0]?.id ?? null, auto: false, candidates, newName };
}
