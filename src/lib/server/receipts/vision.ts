import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../config';
import {
	parsedReceiptSchema,
	type ParsedReceipt,
	type ReceiptFile,
	type ReceiptParser
} from './types';

// snake_case wire schema kept flat and simple for structured outputs
const llmSchema = z.object({
	store: z.string().nullable(),
	purchased_at: z.string().nullable(),
	total_cents: z.number().int().nullable(),
	lines: z.array(
		z.object({
			name: z.string(),
			suggested_name: z.string().nullable(),
			qty: z.number(),
			unit: z.enum(['pc', 'kg', 'l']).nullable(),
			line_cents: z.number().int(),
			kind: z.enum(['item', 'discount', 'pfand', 'pfand_return'])
		})
	)
});

const PROMPT = `You read German supermarket receipts (Kassenbon). The images are one receipt, in order (a long receipt may be split across photos; do not duplicate overlapping lines).

Return:
- store: the chain name as commonly known (e.g. "REWE", "Lidl", "Aldi Süd", "Edeka", "dm"), or null.
- purchased_at: local date and time as "YYYY-MM-DDTHH:mm", or null.
- total_cents: the amount paid (SUMME / ZU ZAHLEN / TOTAL) in cents, or null.
- lines: every printed line that carries an amount, in receipt order, excluding totals, payment, change and VAT summary lines.
  - name: the text exactly as printed.
  - suggested_name: a short everyday product name in German as a household would write it on a shopping list (e.g. "BIO VOLLMILCH 3,8%" -> "Milch", "JA! TOASTBROT" -> "Toastbrot"); null for discounts and Pfand.
  - qty: count or weight (from lines like "2 Stk x 0,99" or "0,512 kg x 2,99 EUR/kg"); 1 if not shown.
  - unit: "pc" for counted items, "kg" for weighed items, "l" if sold by litre, null if unclear.
  - line_cents: the line amount in cents as printed; negative for discounts and returns.
  - kind: "discount" for Rabatt/Coupon/Preisvorteil lines, "pfand" for deposit charges, "pfand_return" for Leergut/Pfandrückgabe, otherwise "item".`;

export type VisionClient = Pick<Anthropic, 'beta'>;

export function createVisionParser(
	client: VisionClient = new Anthropic({ apiKey: config.anthropicApiKey }),
	model = config.anthropicModel
): ReceiptParser {
	return {
		id: 'vision',
		async parse(files: ReceiptFile[]) {
			const content: Anthropic.Beta.BetaContentBlockParam[] = [];
			for (const f of files) {
				const data = (await fs.readFile(f.path)).toString('base64');
				content.push(
					f.mediaType === 'application/pdf'
						? { type: 'document', source: { type: 'base64', media_type: f.mediaType, data } }
						: { type: 'image', source: { type: 'base64', media_type: f.mediaType, data } }
				);
			}
			content.push({ type: 'text', text: PROMPT });

			const response = await client.beta.messages.parse({
				model,
				max_tokens: 16000,
				betas: ['server-side-fallback-2026-07-01'],
				fallbacks: 'default',
				output_config: { effort: 'medium', format: betaZodOutputFormat(llmSchema) },
				messages: [{ role: 'user', content }]
			});
			if (response.stop_reason === 'refusal') throw new Error('model declined to read the receipt');
			if (response.stop_reason === 'max_tokens')
				throw new Error('receipt too long for one request');
			const out = response.parsed_output;
			if (!out) throw new Error('no structured output');
			return { result: fromLlm(out), raw: JSON.stringify(out) };
		}
	};
}

export function fromLlm(out: z.infer<typeof llmSchema>): ParsedReceipt {
	return parsedReceiptSchema.parse({
		store: out.store?.trim() || null,
		purchasedAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(out.purchased_at ?? '')
			? out.purchased_at!.slice(0, 16)
			: null,
		totalCents: out.total_cents,
		lines: out.lines.map((l) => ({
			name: l.name,
			suggestedName: l.suggested_name?.trim() || null,
			qty: l.qty > 0 ? l.qty : 1,
			unit: l.unit,
			lineCents: l.line_cents,
			kind: l.kind
		}))
	});
}
