import { z } from 'zod';
import type { LINE_KINDS } from '../db/schema';

export const UNITS = ['pc', 'kg', 'l'] as const;
export const RAW_LINE_KINDS = [
	'item',
	'discount',
	'order_discount',
	'fee',
	'pfand',
	'pfand_return'
] as const;

export const rawLineSchema = z.object({
	name: z.string(),
	/** Canonical household-style name the LLM proposes, e.g. "Milch" for "BIO VOLLMILCH 3,8%". */
	suggestedName: z.string().nullable().default(null),
	qty: z.number().positive().default(1),
	unit: z.enum(UNITS).nullable().default(null),
	lineCents: z.number().int(),
	kind: z.enum(RAW_LINE_KINDS)
});

export const parsedReceiptSchema = z.object({
	store: z.string().nullable(),
	/** Local time, "YYYY-MM-DDTHH:mm" */
	purchasedAt: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
		.nullable(),
	totalCents: z.number().int().nullable(),
	lines: z.array(rawLineSchema)
});

export type RawLine = z.infer<typeof rawLineSchema>;
export type ParsedReceipt = z.infer<typeof parsedReceiptSchema>;

export type ReceiptFile = { path: string; mediaType: 'image/jpeg' | 'application/pdf' };

/** The files are not in this parser's format; the next parser may try. */
export class UnrecognizedReceipt extends Error {}

export interface ReceiptParser {
	parse(files: ReceiptFile[]): Promise<{ result: ParsedReceipt; raw: string }>;
}

/** A line after discounts were attached to their item, ready for review. */
export type ReviewLine = {
	rawName: string;
	suggestedName: string | null;
	qty: number;
	unit: (typeof UNITS)[number] | null;
	lineCents: number;
	discountCents: number;
	kind: (typeof LINE_KINDS)[number];
};
