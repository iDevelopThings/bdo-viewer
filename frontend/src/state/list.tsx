import {persist, type SerializationStrategy} from "valtio-persist";
import {ref} from "valtio/vanilla";
import {getDefaultNavigationPath, getNavigationListScope, getNavigationNode, navigation} from "@/state/navigation.tsx";
import {CancelError, CancellablePromise} from "@wailsio/runtime";
import {subscribeKey} from "valtio/utils";
import {ListSourceEntries} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {type ListSourceEntry, SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {SortDir} from "@/components/entry-list/entry-list.tsx";

// Loose bag rather than ItemFilters specifically - each source has its own
// Go-side Filters shape (see internal/sources/*_source.go and the panel
// registry in @/components/entry-list/source-filters.tsx), so list state
// can't assume any one shape here.
export type SourceFilters = Record<string, unknown>;

export type ListState = {
	query?: string;
	category?: string;
	subcategory?: string;
	source?: SourceKind;
	// sort is a key from the active source's Sorts (empty = source default);
	// sortDir is the direction toggle. Both are applied Go-side per source.
	sort?: string;
	sortDir?: SortDir;
	filters?: SourceFilters;

	loading: boolean;
	entries: ListSourceEntry[]
}

const listSerializer: SerializationStrategy<ListState, false> = {
	isAsync     : false,
	serialize   : (state) => JSON.stringify({...state, entries : []}),
	deserialize : (data) => JSON.parse(data),
};

export const {store : list} = await persist<ListState>(
	{
		query       : undefined,
		category    : undefined,
		subcategory : undefined,
		source      : undefined,
		sort        : undefined,
		sortDir     : "asc",
		filters     : {},

		loading : false,
		entries : []
	},
	"list",
	{
		serializationStrategy : listSerializer,
		debounceTime          : 500,
	}
);


let debouncedSearchTimeout: any = null;

export function debounceLoadList() {
	if (debouncedSearchTimeout) {
		clearTimeout(debouncedSearchTimeout);
	}
	debouncedSearchTimeout = setTimeout(() => {
		void loadList();
	}, 150);
}

export function applyListFilters(filters: SourceFilters) {
	list.filters = filters;

	debounceLoadList();
}

// clearList wipes the query and filters and resets sort to the current source's
// default, then reloads. The search input keeps its own local state, so callers
// that own an input must clear that too.
export function clearList() {
	const scope = getNavigationListScope(getDefaultNavigationPath());

	list.query   = "";
	list.filters = {};
	list.sort    = scope.source?.sorts?.[0]?.key;
	list.sortDir = "asc";

	void loadList();
}


function syncListFromActiveNode(path: string | undefined) {
	if (!path) {
		return;
	}

	const scope = getNavigationListScope(path);

	// filters and sort are source-specific (grade/weight only mean something for
	// items) - reset them when switching to a different source, but keep them
	// when just browsing between categories within the same source. Compare
	// against the previous source before overwriting list.source below.
	const kind          = scope.kind ?? SourceKind.Unknown;
	const sourceChanged = kind !== list.source;

	list.source      = kind;
	list.category    = scope.category;
	list.subcategory = scope.subcategory;

	if (sourceChanged) {
		list.filters = {};
		list.sort    = scope.source?.sorts?.[0]?.key;
		list.sortDir = "asc";
	}

	debounceLoadList();
}

subscribeKey(navigation, "activePath", syncListFromActiveNode);

const unsubscribeInitialActiveSync = subscribeKey(navigation, "nodesByPath", () => {
	if (!navigation.activePath) {
		return;
	}
	if (!getNavigationNode(navigation.activePath)) {
		console.warn(`Navigation node with path ${navigation.activePath} not found`, navigation.nodesByPath);
		return;
	}

	syncListFromActiveNode(navigation.activePath);
	unsubscribeInitialActiveSync();

});


export function loadList(): CancellablePromise<void> {
	list.loading = true;

	const scope = getNavigationListScope(getDefaultNavigationPath());

	list.source = scope.kind ?? SourceKind.Unknown;

	return ListSourceEntries({
		query        : list.query ?? "",
		source       : list.source,
		category     : list.category,
		sub_category : list.subcategory,
		path_parts   : scope.pathParts,
		sort         : list.sort ?? "",
		sort_dir     : list.sortDir ?? "asc",
		filters      : list.filters ?? {}
	}).then(
		entries => {
			list.entries = ref(entries || []);
		},
		e => {
			if (!(e instanceof CancelError)) {
				console.error("Failed to load list", e);
			}
		}
	).finally(() => {
		list.loading = false;
	});
}
