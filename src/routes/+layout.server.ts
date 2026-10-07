import type { LayoutServerLoadEvent } from './$types';

export const load = ({ locals }: LayoutServerLoadEvent) => ({
	locale: locals.locale,
	user: locals.user && { name: locals.user.name, isAdmin: locals.user.isAdmin }
});
