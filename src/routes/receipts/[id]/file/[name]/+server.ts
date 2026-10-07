import fs from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { getReceipt, receiptFiles } from '#lib/server/receipts/service.ts';
import { intParam, requireUser } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const receipt = getReceipt(getDb(), user.householdId, intParam(params.id));
	// only names recorded on the receipt, never a client-supplied path
	if (!receipt?.files.includes(params.name)) error(404, 'not found');
	const [file] = receiptFiles(receipt.id, [params.name]);
	return new Response(new Uint8Array(await fs.readFile(file.path)), {
		headers: { 'content-type': file.mediaType, 'cache-control': 'private, max-age=86400' }
	});
};
