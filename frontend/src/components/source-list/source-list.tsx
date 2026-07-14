import {IDockviewPanelProps} from "dockview-react";
import {useSnapshot} from "valtio/react";
import {applyListFilters, list, loadList, debounceLoadList, clearList} from "@/state/list.tsx";
import {useEffect, useRef, useState} from "react";
import {useIsContentPanelOpen, goToURN} from "@/state/panels.ts";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {EntryRowBase, EntrySourceBadge, VirtualEntryList} from "@/components/entry-list/entry-list.tsx";
import {getSourceFilterPanel} from "@/components/entry-list/source-filters.tsx";
import {findSourceByType} from "@/state/sources/sources.ts";
import {getNavigationListScope, navigation} from "@/state/navigation.tsx";
import {EntryFilterHeader} from "@/components/entry-list/entry-filter-panel.tsx";

export function SourceList(props: IDockviewPanelProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	const l = useSnapshot(list);
	const n = useSnapshot(navigation);

	// The search box is driven by local state, not the valtio snapshot: the
	// snapshot updates on a deferred tick, so binding value={l.query} makes React
	// re-write the input a beat after each keystroke and reset the caret to the end.
	const [query, setQuery] = useState(list.query ?? "");

	const currentScope = getNavigationListScope(n.activePath);
	const FilterPanel  = getSourceFilterPanel(currentScope.source?.kind);

	const hasActiveFilters = query.trim() !== "" || Object.values(l.filters ?? {}).some(
		v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "",
	);

	useEffect(() => {
		void loadList();
	}, []);

	return (
		<div className={"max-h-full h-full overflow-y-scroll"} ref={parentRef}>
			<div className={"sticky top-0 z-10 bg-background flex flex-col gap-2 p-3 border-b  border-l border-rborder-zinc-800"}>
				<EntryFilterHeader
					query={query}
					setQuery={q => {
						setQuery(q);
						list.query = q;
						debounceLoadList();
					}}
					hasActiveFilters={hasActiveFilters}
					onClearFilters={() => {
						clearList()
					}}
					sortControls={{
						sortKey: l.sort,
						dir: l.sortDir,
						sorts: currentScope.source?.sorts ?? [],
						onChange: (key, dir) => {
							list.sort    = key;
							list.sortDir = dir;
							void loadList();
						}
					}}
				/>

				{FilterPanel && (
					<FilterPanel
						value={l.filters ?? {}}
						onChange={applyListFilters}
					/>
				)}
			</div>

			<VirtualEntryList
				loading={l.loading}
				entries={l.entries}
				parentRef={parentRef}
				emptyMessage={l.source === SourceKind.All && !query.trim() ? "Search across every source" : undefined}
				renderRow={entry => (
					<SourceEntryRow entry={entry} source={list.source ?? SourceKind.Unknown} />
				)}
			/>
		</div>
	);
}

function SourceEntryRow({entry, source}: { entry: DeepReadonly<ListSourceEntry>, source: SourceKind }) {
	const urn    = entry.urn ?? findSourceByType(source)?.entryURN(entry.id);
	const isOpen = useIsContentPanelOpen(source, entry.id, urn);

	// Global search mixes sources, so each result carries the source it came from.
	const entrySource = entry.extra?.source as SourceKind | undefined;

	return (
		<EntryRowBase
			entry={entry}
			active={isOpen}
			badge={source === SourceKind.All && entrySource ? <EntrySourceBadge source={entrySource} /> : undefined}
			onClick={e => {
				goToURN(urn, {title : entry.title, pinned : e.ctrlKey || e.metaKey});
			}}
			onAuxClick={() => {
				goToURN(urn, {title : entry.title, pinned : true});
			}}
		/>
	);
}
