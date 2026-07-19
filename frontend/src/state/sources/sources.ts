import {GetAllSources, GetNavigationTree} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {type Source, SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {Character, WorldRegion, KnowledgeEntry, KnowledgeTheme, type Item, Zone, NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {buildNavigationTree} from "@/state/navigation.tsx";
import {persist} from "valtio-persist";
import type {MaybeReadonly, DeepReadonly} from "@/types.ts";
import {createURNHandler, parseURN, type URNHandler, KnowledgeURN} from "@/lib/urn.ts";
import type {SortOption} from "@/components/entry-list/entry-list.tsx";


const wrappedSourceSymbol = Symbol("wrappedSource");
export type WrappedSource = {
	kind: SourceKind;
	entryKinds?: string[];
	sorts?: SortOption[];

	entryURN(key: string | number, kind?: string): string | undefined
	matchesURN(urn: string): boolean
	entryFromURN(urn: string): { source: SourceKind, key: string, urn: string } | undefined
}

type SourceURNDefinition = {
	handler: URNHandler;
	entryKinds?: string[];
	defaultKind?: string;
};

type SourceURNMetadata = {
	domain: string;
	kinds?: string[];
	kind?: string;
	defaultKind?: string;
};

function sourceURNDefinition(source: Source): SourceURNDefinition | undefined {
	const meta = (source as Source & { urn?: SourceURNMetadata }).urn;
	if (!meta?.domain) {
		return undefined;
	}
	const entryKinds = meta.kind ? [meta.kind] : meta.kinds;
	return {
		handler     : createURNHandler(meta.domain, meta.kinds ?? []),
		entryKinds,
		defaultKind : meta.defaultKind ?? meta.kind,
	};
}

export function wrapSource(source: Source | undefined): WrappedSource | undefined {
	if (!source) {
		return undefined;
	}

	if ((source as any)[wrappedSourceSymbol]) {
		return (source as any)[wrappedSourceSymbol];
	}

	const urnDefinition          = sourceURNDefinition(source);
	const wrapped: WrappedSource = {
		...source,
		[wrappedSourceSymbol] : true,
		entryKinds            : urnDefinition?.entryKinds,

		entryURN(key: string | number, kind?: string): string | undefined {
			const def = urnDefinition;
			if (!def) {
				return undefined;
			}
			const entryKind = kind ?? def.defaultKind;
			return entryKind ? def.handler.new(entryKind, key) : def.handler.new(key);
		},
		matchesURN(urn: string): boolean {
			const def = urnDefinition;
			if (!def) {
				return false;
			}
			if (!def.entryKinds?.length) {
				return def.handler.match(urn);
			}
			return def.entryKinds.some(kind => def.handler.match(urn, kind));
		},
		entryFromURN(urn: string): { source: SourceKind, key: string, urn: string } | undefined {
			if (!this.matchesURN(urn)) {
				return undefined;
			}
			const parsed = parseURN(urn);
			return {
				source : source.kind,
				key    : parsed.id,
				urn,
			};
		}
	};

	Object.defineProperty(source, wrappedSourceSymbol, {
		value        : wrapped,
		writable     : false,
		configurable : false,
	});

	return wrapped;
}


export type SourcesState = {
	wrappedSources: WrappedSource[];
	loading: boolean;
}
export const {store : sources} = await persist<SourcesState>({
	wrappedSources : [],
	loading        : false,
}, "sources", {
	mergeStrategy : {
		isAsync : false,
		merge   : (initialState, restoredState) => {
			const result          = Object.assign(initialState, restoredState);
			result.wrappedSources = restoredState.wrappedSources
				.map(s => wrapSource(s)!)
				.filter(s => s !== undefined);
			return result;
		},
	}
});

export async function loadSources() {
	sources.loading = true;

	try {

		const [sourceList, tree] = await Promise.all([
			GetAllSources(),
			GetNavigationTree()
		]);

		sources.wrappedSources = sourceList
			.map(s => wrapSource(s))
			.filter(s => s !== undefined);

		buildNavigationTree(tree);

	} catch (error) {
		console.error("Failed to load sources", error);
	} finally {
		sources.loading = false;
	}
}

export function findSourceByType(type: SourceKind): WrappedSource | undefined {
	return sources.wrappedSources.find(source => source.kind === type);
}

export function findSourceByURN(urn: string | undefined): WrappedSource | undefined {
	if (!urn) {
		return undefined;
	}
	return sources.wrappedSources.find(source => source.matchesURN(urn));
}

export function isRegion(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Region, value: WorldRegion } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === SourceKind.Region;
}

export function isCharacter(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Character, value: Character } {
	return entry?.type === SourceKind.Character;
}

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

export function isItem(entry: UntypedSourceEntry | DeepReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Item, value: Item } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === "item";
}

export function isGrindSpot(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.GrindSpot, value: Zone } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === SourceKind.GrindSpot;
}

export function isNpc(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Npc, value: NPC } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === SourceKind.Npc;
}
