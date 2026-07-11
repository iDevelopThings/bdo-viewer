import {IDockviewPanelProps} from "dockview-react";
import {useSnapshot} from "valtio/react";
import {applyDebouncedListSearch, applyListFilters, clearList, list, loadList, debounceLoadList} from "@/state/list.tsx";
import {Input} from "@/components/ui/input.tsx";
import {InputGroup} from "@/components/ui/input-group.tsx";
import {XIcon} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useIsContentPanelOpen} from "@/state/panels.ts";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {EntryRowBase, SortControls, VirtualEntryList} from "@/components/entry-list/entry-list.tsx";
import {getSourceFilterPanel} from "@/components/entry-list/source-filters.tsx";
import {goToURN} from "@/state/panels.ts";
import {findSourceByType} from "@/state/sources/sources.ts";
import {getNavigationListScope, navigation} from "@/state/navigation.tsx";

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
		void loadList()
	}, []);

	return (
		<div className={"max-h-full overflow-y-scroll"} ref={parentRef}>
			<div className={"sticky top-0 z-10 bg-background flex flex-col gap-2 p-6"}>
				<div className={"flex flex-row gap-1 items-center"}>
					<InputGroup className={"flex-1"}>
						<Input
							id={"source-list-search"}
							placeholder="Search..."
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								list.query = e.target.value;
								debounceLoadList()
							}}
						/>
					</InputGroup>
					{hasActiveFilters && (
						<button
							type={"button"}
							data-testid={"clear-list"}
							title={"Clear search and filters"}
							onClick={() => {
								setQuery("");
								clearList();
							}}
							className={"h-9 w-9 flex items-center justify-center shrink-0 rounded-md border border-input bg-transparent dark:bg-input/30 text-zinc-300 outline-none cursor-pointer hover:bg-zinc-800 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"}
						>
							<XIcon className={"size-4"} />
						</button>
					)}
				</div>

				<SortControls
					sorts={currentScope.source?.sorts ?? []}
					sortKey={l.sort}
					dir={l.sortDir ?? "asc"}
					onChange={(sort, dir) => {
						list.sort    = sort;
						list.sortDir = dir;
						void loadList();
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
				renderRow={entry => (
					<SourceEntryRow entry={entry} source={list.source ?? SourceKind.Unknown} />
				)}
			/>
		</div>
	);
}

function SourceEntryRow({entry, source}: { entry: DeepReadonly<ListSourceEntry>, source: SourceKind }) {
	const urn = entry.urn ?? findSourceByType(source)?.entryURN(entry.id);
	const isOpen = useIsContentPanelOpen(source, entry.id, urn);

	return (
		<EntryRowBase
			entry={entry}
			active={isOpen}
			onClick={e => {
				goToURN(urn, {title : entry.title, pinned : e.ctrlKey || e.metaKey});
			}}
			onAuxClick={() => {
				goToURN(urn, {title : entry.title, pinned : true});
			}}
		/>
	);
}
