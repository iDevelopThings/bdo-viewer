import {GetAllSources, GetNavigationTree} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {Source, SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {Character, WorldRegion, KnowledgeEntry, KnowledgeTheme, Item, Zone, NPC, Territory, WorldNode} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {buildNavigationTree} from "@/state/navigation.tsx";
import {persist} from "valtio-persist";
import type {MaybeReadonly} from "@/types.ts";
import {createURNHandler, parseURN, type URNHandler, urnKind} from "@/lib/urn.ts";
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

function sourceURNDefinition(source: Source): SourceURNDefinition | undefined {
	const meta = (source).urn;
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

export function wrapSource(source: Source): WrappedSource | undefined {
	if (!source) {
		return undefined;
	}

	if ((source)[wrappedSourceSymbol]) {
		return (source)[wrappedSourceSymbol];
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
				.map(s => wrapSource(s))
				.filter((s): s is WrappedSource => s !== undefined);
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

		sources.wrappedSources = (sourceList ?? [])
			.map(s => wrapSource(s))
			.filter((s): s is WrappedSource => s !== undefined);

		buildNavigationTree(tree ?? []);

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

// URNValueMap associates each urn kind (its domain, or "domain:kind") with the
// model type the entry's value holds. The go source system is dynamic, so this
// is a frontend convenience for typing an otherwise-`any` value — the guards
// below are a light validation layer, not a hard guarantee.
export type URNValueMap = {
	"item": Item;
	"npc": NPC;
	"grindspot": Zone;
	"character": Character;
	"knowledge:theme": KnowledgeTheme;
	"knowledge:entry": KnowledgeEntry;
	"world:region": WorldRegion;
	"world:territory": Territory;
	"world:node": WorldNode;
};
export type URNKind = keyof URNValueMap;

// EntryOf narrows the entry's value to a urn kind's model type while keeping the
// rest of the entry (urn, type) — a bare {type, value} predicate would drop them.
export type EntryOf<K extends URNKind> = Omit<UntypedSourceEntry, "value"> & { value: URNValueMap[K] };

// isKind discriminates on the urn rather than the entry's `type`: the urn is
// authoritative and finer-grained (it distinguishes knowledge themes from
// entries, which the single Knowledge source kind cannot).
export function isKind<K extends URNKind>(entry: MaybeReadonly<UntypedSourceEntry> | undefined, kind: K): entry is EntryOf<K> {
	return urnKind(entry?.urn) === kind;
}

export function isRegion(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"world:region"> {
	return isKind(entry, "world:region");
}

export function isCharacter(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"character"> {
	return isKind(entry, "character");
}

export function isKnowledge(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"knowledge:entry"> {
	return isKnowledgeEntry(entry);
}

export function isKnowledgeEntry(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"knowledge:entry"> {
	return isKind(entry, "knowledge:entry");
}

export function isKnowledgeTheme(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"knowledge:theme"> {
	return isKind(entry, "knowledge:theme");
}

export function isItem(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"item"> {
	return isKind(entry, "item");
}

export function isGrindSpot(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"grindspot"> {
	return isKind(entry, "grindspot");
}

export function isNpc(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is EntryOf<"npc"> {
	return isKind(entry, "npc");
}
