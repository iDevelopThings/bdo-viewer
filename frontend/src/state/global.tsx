import {persist} from "valtio-persist";
import {useSnapshot} from "valtio/react";

export type GlobalState = {
	expandedSources: Record<string, boolean>
}

export const {store : global} = await persist<GlobalState>({
	expandedSources : {}
}, "global");

export function isExpanded(id: string) {
	return !!global.expandedSources[id];
}

export function useIsExpanded(id: string): boolean {
	return !!useSnapshot(global).expandedSources[id];
}

export function toggleExpanded(id: string) {
	toggleExpansion(id, isExpanded(id));
}

export function toggleExpansion(id: string, current: boolean) {
	if (current) {
		delete global.expandedSources[id];
	} else {
		global.expandedSources[id] = true;
	}
}
