import { page } from '$app/state';
import {
	DEFAULT_LOCALE,
	formatCents,
	formatDate,
	isLocale,
	translate,
	type Locale,
	type MessageKey
} from './i18n';

function locale(): Locale {
	const l = page.data?.locale;
	return isLocale(l) ? l : DEFAULT_LOCALE;
}

export const t = (key: MessageKey, params?: Record<string, string | number>) =>
	translate(locale(), key, params);
export const money = (cents: number) => formatCents(locale(), cents);
export const date = (d: Date | number, opts?: Intl.DateTimeFormatOptions) =>
	formatDate(locale(), d, opts);
