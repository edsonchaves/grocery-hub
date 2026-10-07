import { describe, expect, it } from 'vitest';
import { catalogs, localeFromAcceptLanguage, resolveLocale, translate } from './index';

describe('i18n', () => {
	it('every catalog has every key', () => {
		const keys = Object.keys(catalogs.pt).sort();
		expect(Object.keys(catalogs.de).sort()).toEqual(keys);
		expect(Object.keys(catalogs.en).sort()).toEqual(keys);
	});

	it('interpolates params', () => {
		expect(translate('en', 'list.basketMissing', { n: 3 })).toBe('3 without price');
	});

	it('anonymous login page follows browser language', () => {
		expect(localeFromAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
		expect(localeFromAcceptLanguage('fr-FR,en;q=0.5')).toBe('en');
		expect(resolveLocale(undefined, 'fr-FR')).toBe('pt');
		expect(resolveLocale('en', 'de-DE')).toBe('en');
	});
});
