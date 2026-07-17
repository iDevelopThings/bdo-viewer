import {useEffect, useRef, useState} from "react";
import {X} from "lucide-react";
import {CancelError} from "@wailsio/runtime";
import {ListSourceEntries} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {type ListSourceEntry, SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {Button} from "@/components/ui/button.tsx";
import {EntryRowBase, type SortDir, VirtualEntryList} from "@/components/entry-list/entry-list.tsx";
import {type ItemFilterField, type ItemFilters, ItemFiltersPanel} from "@/components/entry-list/item-filters.tsx";
import {EntryFilterHeader} from "@/components/entry-list/entry-filter-panel.tsx";
import {findSourceByType} from "@/state/sources/sources.ts";

// EntryPicker is the generic search-and-pick slide-over: a search box, optional
// filter fields, and a virtualized result list from ListSourceEntries. The gear
// item picker and the crafting calculator's "add item" flow both compose it —
// they only differ in title, which filter fields show, the fixed baseFilters
// they scope to (equip slots / class / craftable), and what onPick does.
//
// It mirrors SourceList's header (EntryFilterHeader + source-driven SortControls),
// but backs everything with local state and a direct ListSourceEntries call instead
// of the shared `list` store — it's a transient modal and must not clobber the main
// source-list panel.
export type EntryPickerProps = {
	title: string;
	source?: SourceKind;
	// fields are the user-editable filter rows shown under the search box.
	fields?: ItemFilterField[];
	// baseFilters are fixed constraints merged into every query (not user-editable),
	// e.g. the gear picker's equipSlots/class or the calculator's craftable flag.
	baseFilters?: Partial<ItemFilters>;
	// defaultSort/defaultSortDir set the initial ordering — a key from the source's
	// Sorts (e.g. "grade" for the gear picker); defaults to the source's first sort.
	defaultSort?: string;
	defaultSortDir?: SortDir;
	onPick: (entry: DeepReadonly<ListSourceEntry>) => void;
	onClose: () => void;
	defaultFocus?:boolean
};

export function EntryPicker({
	title,
	source = SourceKind.Item,
	fields = ["grade", "effect"],
	baseFilters,
	defaultSort,
	defaultSortDir = "asc",
	onPick,
	onClose,
	defaultFocus
}: EntryPickerProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	const s = findSourceByType(source);

	const [query, setQuery]     = useState("");
	const [sortKey, setSortKey] = useState<string>(() => defaultSort ?? findSourceByType(source)?.sorts?.[0]?.key ?? "");
	const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
	const [filters, setFilters] = useState<ItemFilters>({});
	const [entries, setEntries] = useState<ListSourceEntry[]>([]);
	const [loading, setLoading] = useState(true);

	const hasActiveFilters = query.trim() !== "" || Object.values(filters).some(
		v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "",
	);

	// baseFilters is usually an inline object literal, so depend on its content, not
	// its identity — otherwise every parent re-render would re-run the query.
	const baseKey = JSON.stringify(baseFilters ?? {});

	useEffect(() => {
		setLoading(true);

		let cancelled = false;
		const timeout = setTimeout(() => {
			ListSourceEntries({
				query    : query,
				source   : source,
				sort     : sortKey,
				sort_dir : sortDir,
				filters  : {...filters, ...baseFilters},
			}).then(
				result => {
					if (cancelled) return;
					setEntries(result);
					setLoading(false);
				},
				e => {
					if (cancelled) return;
					if (!(e instanceof CancelError)) {
						console.error("EntryPicker: failed to load entries", e);
					}
					setLoading(false);
				},
			);
		}, 150);

		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [query, sortKey, sortDir, filters, source, baseKey]);

	return (
		<div
			className={"absolute inset-0 z-10 flex flex-row"}
			onClick={onClose}
			onKeyDown={e => {
				if (e.key === "Escape") {
					onClose();
				}
			}}
		>
			<div className={"flex-1 bg-black/50"} />
			<div
				className={"w-96 max-w-full h-full bg-zinc-900 border-l border-zinc-800 flex flex-col"}
				onClick={e => e.stopPropagation()}
			>
				<div className={"flex flex-row items-center gap-2 p-2 border-b border-zinc-800"}>
					<span className={"font-semibold text-sm flex-1 truncate"}>{title}</span>
					<Button variant={"ghost"} size={"icon-xs"} onClick={onClose}>
						<X />
					</Button>
				</div>

				<div className={"flex flex-col gap-2 p-1"}>
					<EntryFilterHeader
						query={query}
						setQuery={setQuery}
						hasActiveFilters={hasActiveFilters}
						onClearFilters={() => setFilters({})}
						sortControls={{
							sorts   : s?.sorts ?? [],
							sortKey : sortKey,
							dir     : sortDir,
							onChange: (key, dir) => {
								setSortKey(key);
								setSortDir(dir);
							},
						}}
						defaultFocus={defaultFocus}
					/>

					{fields.length > 0 && (
						<ItemFiltersPanel value={filters} onChange={setFilters} fields={fields} />
					)}
				</div>

				<div ref={parentRef} className={"flex-1 overflow-auto"}>
					<VirtualEntryList
						loading={loading}
						entries={entries}
						parentRef={parentRef}
						renderRow={entry => (
							<EntryRowBase entry={entry} onClick={() => onPick(entry)} />
						)}
					/>
				</div>
			</div>
		</div>
	);
}
