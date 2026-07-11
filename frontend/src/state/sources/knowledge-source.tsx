import {KnowledgeEntry, KnowledgeTheme} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model/index.ts";
import type {MaybeReadonly} from "@/types.ts";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {wrap} from "@/utils.tsx";
import {KnowledgeURN} from "@/lib/urn.ts";



export function isKnowledge(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Knowledge, value: KnowledgeEntry } {
	return isKnowledgeEntry(entry);
}

export function isKnowledgeEntry(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Knowledge, value: KnowledgeEntry } {
	if (entry === undefined) {
		return false;
	}
	if (typeof entry.value !== "object" || entry.value === null) {
		return false;
	}
	return entry.type === SourceKind.Knowledge && (
		KnowledgeURN.match(entry.urn, "entry") || "description" in entry.value
	);
}

export function isKnowledgeTheme(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Knowledge, value: KnowledgeTheme } {
	if (entry === undefined) {
		return false;
	}
	if (typeof entry.value !== "object" || entry.value === null) {
		return false;
	}
	return entry.type === SourceKind.Knowledge && (
		KnowledgeURN.match(entry.urn, "theme") || ("key" in entry.value && !("description" in entry.value))
	);
}

const sym = Symbol("WrappedKnowledge");

export type WrappedKnowledge = KnowledgeEntry & {}

export function WrapKnowledge(value: KnowledgeEntry | undefined) {
	return wrap(value, sym, () => ({
		testing : true
	}));
} 
