export const LOCALES = ['pt', 'de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
