import type { SessionUser } from '#lib/server/auth.ts';
import type { Locale } from '#lib/i18n/locales.ts';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			locale: Locale;
		}
	}
}

export {};
