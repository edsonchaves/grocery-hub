export const PANTRY_STATUSES = ['in_stock', 'low', 'out'] as const;
export type PantryStatus = (typeof PANTRY_STATUSES)[number];

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
