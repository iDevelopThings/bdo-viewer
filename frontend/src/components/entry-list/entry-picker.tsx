import {useEffect, useRef, useState} from "react";
import {X} from "lucide-react";
import {CancelError} from "@wailsio/runtime";
import {ListSourceEntries} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {type ListSourceEntry, SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {Input} from "@/components/ui/input.tsx";
import {InputGroup} from "@/components/ui/input-group.tsx";
import {Button} from "@/components/ui/button.tsx";
import {type EntrySort, EntryRowBase, sortParam, SortSelect, VirtualEntryList} from "@/components/entry-list/entry-list.tsx";
import {type ItemFilterField, type ItemFilters, ItemFiltersPanel} from "@/components/entry-list/item-filters.tsx";

// EntryPicker is the generic search-and-pick slide-over: a search box, optional
// filter fields, and a virtualized result list from ListSourceEntries. The gear
// item picker and the crafting calculator's "add item" flow both compose it —
// they only differ in title, which filter fields show, the fixed baseFilters
// they scope to (equip slots / class / craftable), and what onPick does.
export type EntryPickerProps = {
	title: string;
	source?: SourceKind;
	// fields are the user-editable filter rows shown under the search box.
	fields?: ItemFilterField[];
	// baseFilters are fixed constraints merged into every query (not user-editable),
	// e.g. the gear picker's equipSlots/class or the calculator's craftable flag.
	baseFilters?: Partial<ItemFilters>;
	defaultSort?: EntrySort;
	onPick: (entry: DeepReadonly<ListSourceEntry>) => void;
	onClose: () => void;
};

export function EntryPicker({
	title,
	source = SourceKind.Item,
	fields = ["grade", "itemType", "effect"],
	baseFilters,
	defaultSort = "grade",
	onPick,
	onClose,
}: EntryPickerProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	const [query, setQuery]     = useState("");
	const [sort, setSort]       = useState<EntrySort>(defaultSort);
	const [filters, setFilters] = useState<ItemFilters>({});
	const [entries, setEntries] = useState<ListSourceEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);

		let cancelled  = false;
		const timeout = setTimeout(() => {
			ListSourceEntries({
				query   : query,
				source  : source,
				sort    : sortParam(sort),
				filters : {...filters, ...baseFilters},
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
	}, [query, sort, filters, source, baseFilters]);

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
					<div className={"flex flex-row gap-1 items-center"}>
						<InputGroup className={"flex-1"}>
							<Input
								autoFocus
								placeholder="Search..."
								value={query}
								onChange={e => setQuery(e.target.value)}
							/>
						</InputGroup>
						<SortSelect value={sort} onChange={setSort} />
					</div>

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
