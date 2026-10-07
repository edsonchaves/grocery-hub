/** "1,29" / "1.29" / "-0,30" → cents; NaN when unreadable. */
export function parseEuro(s: string) {
	const v = s.trim().replace(/\s|€/g, '').replace(',', '.');
	if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return NaN;
	return Math.round(Number(v) * 100);
}

export const euroInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
