export const PANTRY_STATUSES = ['in_stock', 'low', 'out'] as const;
export type PantryStatus = (typeof PANTRY_STATUSES)[number];

export const QTY_UNITS = ['pc', 'g', 'kg', 'ml', 'l'] as const;
export type QtyUnit = (typeof QTY_UNITS)[number];

export const PLAN_ENTRY_KINDS = ['dish', 'product', 'leftovers'] as const;
export type PlanEntryKind = (typeof PLAN_ENTRY_KINDS)[number];

export type ListItemView = {
	id: number;
	productId: number | null;
	name: string;
	qty: string | null;
	note: string | null;
	checked: boolean;
	checkedAt: number | null;
	createdAt: number;
	categoryId: number | null;
	categoryName: string | null;
	categoryOrder: number | null;
};
