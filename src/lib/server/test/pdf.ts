/**
 * Minimal PDF from fixture text: blank lines start a new page, columns (split on 2+ spaces)
 * become separate text items on the same baseline, like eBons and online invoices.
 */
export function textPdf(lines: string[]) {
	// € is 0x80 in WinAnsiEncoding, outside latin1
	const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/€/g, '\\200');
	const pages: string[][] = [[]];
	for (const line of lines) {
		if (line.trim()) pages.at(-1)!.push(line);
		else if (pages.at(-1)!.length) pages.push([]);
	}
	if (!pages.at(-1)!.length) pages.pop();

	const objs = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
	];
	const kids: string[] = [];
	for (const page of pages) {
		const ops: string[] = [];
		page.forEach((line, i) => {
			const y = 800 - i * 12;
			line.split(/\s{2,}/).forEach((col, c) => {
				ops.push(`BT /F1 9 Tf ${20 + c * 110} ${y} Td (${esc(col)}) Tj ET`);
			});
		});
		const stream = ops.join('\n');
		objs.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
		const contents = objs.length;
		objs.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 842] /Contents ${contents} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
		);
		kids.push(`${objs.length} 0 R`);
	}
	objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(Buffer.byteLength(pdf, 'latin1'));
		pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = Buffer.byteLength(pdf, 'latin1');
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
	pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return Buffer.from(pdf, 'latin1');
}
