import { LOCALES, type Locale } from './locales';
import { pt, type Messages } from './pt';
import { de } from './de';
import { en } from './en';

export { LOCALES, type Locale };
export type MessageKey = keyof Messages;

export const catalogs: Record<Locale, Messages> = { pt, de, en };
export const DEFAULT_LOCALE: Locale = 'pt';

export function isLocale(v: unknown): v is Locale {
	return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function translate(
	locale: Locale,
	key: MessageKey,
	params?: Record<string, string | number>
): string {
	const msg = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
	if (!params) return msg;
	return msg.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

export function localeFromAcceptLanguage(header: string | null): Locale | undefined {
	if (!header) return undefined;
	const ranked = header
		.split(',')
		.map((part) => {
			const [tag, ...attrs] = part.trim().split(';');
			const q = attrs.find((a) => a.trim().startsWith('q='));
			return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q.trim().slice(2)) : 1 };
		})
		.sort((a, b) => b.q - a.q);
	return ranked.map((r) => r.lang).find(isLocale);
}

export function resolveLocale(userLocale: string | undefined, acceptLanguage: string | null) {
	if (isLocale(userLocale)) return userLocale;
	return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

const intlLocale: Record<Locale, string> = { pt: 'pt-BR', de: 'de-DE', en: 'en-GB' };

export function formatCents(locale: Locale, cents: number) {
	return new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: 'EUR' }).format(
		cents / 100
	);
}

export function formatDate(locale: Locale, d: Date | number, opts?: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(intlLocale[locale], opts ?? { dateStyle: 'medium' }).format(d);
}
