import {persist} from "valtio-persist";

export type GlobalState = {
	expandedSources: Set<string>
}

export const {store : global} = await persist<GlobalState>({
	expandedSources : new Set<string>()
}, "global");

// Reassigns the whole Set instead of mutating it in place - a plain Set isn't
// itself a valtio proxy, so add()/delete() on it wouldn't trigger reactivity.
// Reassigning global.expandedSources is a normal property set on `global`
// (which is a proxy), so that's what subscribers actually see change.

export function isExpanded(id: string) {
	return global.expandedSources.has(id);
}

export function toggleExpanded(id: string) {
	const next = new Set(global.expandedSources);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	global.expandedSources = next;
}

export function toggleExpansion(id: string, current: boolean) {
	const next = new Set(global.expandedSources);
	if (current) {
		next.delete(id);
	} else {
		next.add(id);
	}
	global.expandedSources = next;
}
