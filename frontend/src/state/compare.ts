import {persist} from "valtio-persist";

export type CompareEntry = {
	urn: string;
	title: string;
	icon?: string;
};

export type CompareState = {
	entries: CompareEntry[];
};

export const {store: compare} = await persist<CompareState>({entries: []}, "compare-items");

export function addToCompare(entry: CompareEntry) {
	if (!compare.entries.some(e => e.urn === entry.urn)) {
		compare.entries.push(entry);
	}
}

export function removeFromCompare(urn: string) {
	compare.entries = compare.entries.filter(e => e.urn !== urn);
}

export function clearCompare() {
	compare.entries = [];
}
