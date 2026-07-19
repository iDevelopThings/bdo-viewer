import type {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {persist} from "valtio-persist";

export type HistoryState = {
	entries: UntypedSourceEntry[];
}
export const {store : history} = await persist<HistoryState>({
	entries : []
}, "history");

export function addHistoryEntry(entry: UntypedSourceEntry) {
	const idx = history.entries.findIndex(e => {
		if (e.urn || entry.urn) {
			return e.urn === entry.urn;
		}
		return e.type === entry.type && e.value?.id === entry.value?.id;
	});

	if (idx >= 0) {
		history.entries.splice(idx, 1);
	}

	history.entries.unshift(entry);

	if (history.entries.length > 20) {
		history.entries.pop();
	}
}
