import {GetEntryDetailsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";

// Generic entry details as returned by GetEntryDetailsByURN - the raw entity
// lives under details[kind] (kind === the source's SourceKind), same
// convention every Source.GetEntryDetails follows. stats bundles both the
// top-level stat cards and the titled effect sections (see lib/stat-groups.ts
// for splitting them back apart for display).
export type EntryDetails = {
	stats?: StatGroup[] | null;
	[key: string]: unknown;
};

// Cached across every caller (a tooltip re-hover, adding the same item to a
// compare panel twice), so re-requesting the same entry doesn't refetch.
const detailsCache = new Map<string, Promise<EntryDetails | undefined>>();

export function loadEntryDetails(urn: string): Promise<EntryDetails | undefined> {
	let entry = detailsCache.get(urn);
	if (!entry) {
		entry = GetEntryDetailsByURN(urn).then(data => (data ?? undefined) as EntryDetails | undefined);
		detailsCache.set(urn, entry);
	}

	return entry;
}
