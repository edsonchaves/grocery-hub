import { EventEmitter } from 'node:events';
import type { ListItemView } from '../types';

export type ListEvent =
	{ type: 'upsert'; items: ListItemView[] } | { type: 'remove'; ids: number[] };

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(householdId: number, event: ListEvent) {
	bus.emit(`list:${householdId}`, event);
}

export function subscribe(householdId: number, fn: (e: ListEvent) => void) {
	bus.on(`list:${householdId}`, fn);
	return () => bus.off(`list:${householdId}`, fn);
}
