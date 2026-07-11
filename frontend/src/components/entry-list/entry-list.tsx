import {type MouseEvent, type MutableRefObject, type ReactNode, useCallback} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowUp} from "lucide-react";
import {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {type Grade, grades} from "@/types.ts";
import {cn} from "@/lib/utils.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";

// Sorting itself happens in the backend (ListSourceParams.sort) so each source
// can support and extend its own orderings; "default" sends the empty string,
// keeping the source's query-ranked order.
export type EntrySort = "default" | "name" | "grade";

export function sortParam(sort: EntrySort | undefined): string {
	return !sort || sort === "default" ? "" : sort;
}

const sortLabels: Record<EntrySort, string> = {
	default : "Default",
	name    : "Name",
	grade   : "Grade",
};

export function SortSelect({value, onChange, className}: {
	value: EntrySort,
	onChange: (sort: EntrySort) => void,
	className?: string,
}) {
	return (
		<select
			value={value}
			onChange={e => onChange(e.target.value as EntrySort)}
			className={cn(
				"h-9 shrink-0 rounded-md border border-input bg-transparent dark:bg-input/30 px-2 text-sm text-zinc-300 outline-none cursor-pointer",
				"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-zinc-900",
				className,
			)}
			title={"Sort by"}
		>
			{(Object.keys(sortLabels) as EntrySort[]).map(key => (
				<option key={key} value={key}>{sortLabels[key]}</option>
			))}
		</select>
	);
}

// SortOption mirrors the Go sources.SortOption surfaced on each source's
// BaseSource.Sorts (GetAllSources); the sort dropdown is driven by these so
// items can offer Grade/Weight while other sources offer just Name.
export type SortOption = { key: string; label: string };
export type SortDir = "asc" | "desc";

// SortControls is the source-driven sort picker: a type dropdown fed from the
// source's Sorts plus a direction toggle. Renders nothing when the source
// offers no orderings.
export function SortControls({sorts, sortKey, dir, onChange, className}: {
	sorts: readonly SortOption[],
	sortKey: string | undefined,
	dir: SortDir,
	onChange: (key: string, dir: SortDir) => void,
	className?: string,
}) {
	if (!sorts.length) {
		return null;
	}

	const active = sorts.some(s => s.key === sortKey) ? sortKey! : sorts[0].key;

	const control = "h-8 shrink-0 rounded-md border border-input bg-transparent dark:bg-input/30 text-zinc-300 outline-none cursor-pointer focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

	return (
		<div className={cn("flex flex-row items-center gap-1", className)} data-testid={"sort-controls"}>
			<span className={"text-xs text-muted-foreground mr-1"}>Sort</span>
			<select
				value={active}
				onChange={e => onChange(e.target.value, dir)}
				data-testid={"sort-key"}
				className={cn(control, "px-2 text-sm [&>option]:bg-zinc-900")}
				title={"Sort by"}
			>
				{sorts.map(s => (
					<option key={s.key} value={s.key}>{s.label}</option>
				))}
			</select>
			<button
				type={"button"}
				data-testid={"sort-dir"}
				data-dir={dir}
				onClick={() => onChange(active, dir === "asc" ? "desc" : "asc")}
				title={dir === "asc" ? "Ascending" : "Descending"}
				className={cn(control, "w-8 flex items-center justify-center hover:bg-zinc-800")}
			>
				{dir === "asc" ? <ArrowUp className={"size-4"} /> : <ArrowDown className={"size-4"} />}
			</button>
		</div>
	);
}

export type EntryRowBaseProps = {
	entry: DeepReadonly<ListSourceEntry>;
	active?: boolean;
	onClick?: (e: MouseEvent) => void;
	onAuxClick?: (e: MouseEvent) => void;
};

export function EntryRowBase({entry, active, onClick, onAuxClick}: EntryRowBaseProps) {
	const gradeColor = entry.subtitle ? grades[entry.subtitle as Grade]?.color : undefined;

	return (
		<div
			data-active={active ?? false}
			data-testid={"entry-row"}
			data-urn={entry.urn}
			className={cn(
				"flex flex-row items-center gap-4 p-2 hover:bg-zinc-800 cursor-pointer",
				"data-[active=true]:bg-zinc-800",
			)}
			onClick={onClick}
			onMouseDown={e => {
				if (e.button === 1) {
					e.preventDefault();
				}
			}}
			onAuxClick={e => {
				if (e.button === 1) {
					onAuxClick?.(e);
				}
			}}
		>
			{entry.icon && <ItemIcon urn={entry.urn} className={"min-w-0 gap-2"} imageClass={"w-6 h-6 shrink-0"} />}
			<div className={"flex flex-col flex-1 min-w-0 gap-1"}>
				<div className={"flex-1 truncate"} style={gradeColor ? {color : gradeColor} : undefined}>
					{entry.title}
				</div>
				{entry.subtitle && (
					<div className={"text-xs text-zinc-400 truncate"}>
						{entry.subtitle}
					</div>
				)}
			</div>
		</div>
	);
}

export type VirtualEntryListProps = {
	loading: boolean;
	entries: DeepReadonly<ListSourceEntry[]>;
	parentRef: MutableRefObject<HTMLDivElement | null>;
	renderRow: (entry: DeepReadonly<ListSourceEntry>, index: number) => ReactNode;
};

export function VirtualEntryList({loading, entries, parentRef, renderRow}: VirtualEntryListProps) {
	// Key by URN (unique across sources); many non-item sources share id 0.
	const getItemKey       = useCallback((index: number) => entries[index].urn || entries[index].id, [entries]);
	const getScrollElement = useCallback(() => parentRef.current, [parentRef]);
	const estimateSize     = useCallback(() => {
		// Check the first 5 entries to see if they have a subtitle, and adjust the height accordingly.
		for (let i = 0; i < Math.min(entries.length, 5); i++) {
			if (entries[i].subtitle) {
				return 60;
			}
		}
		return 40;
	}, [entries]);

	const rowVirtualizer = useVirtualizer({
		count                               : entries.length,
		getScrollElement,
		estimateSize,
		getItemKey,
		useAnimationFrameWithResizeObserver : true,
		overscan                            : 8,
	});

	if (loading) {
		return <div className={"p-4 text-sm text-zinc-400"}>Loading...</div>;
	}

	if (entries.length === 0) {
		return <div className={"p-4 text-sm text-zinc-400"}>No entries found</div>;
	}

	return (
		<div data-panel={"list"} style={{
			height   : `${rowVirtualizer.getTotalSize()}px`,
			width    : "100%",
			position : "relative",
		}}>
			{rowVirtualizer.getVirtualItems().map((virtualItem) => (
				<div
					key={virtualItem.key}
					data-index={virtualItem.index}
					ref={rowVirtualizer.measureElement}
					style={{
						position  : "absolute",
						top       : 0,
						left      : 0,
						width     : "100%",
						transform : `translateY(${virtualItem.start}px)`,
					}}
				>
					{renderRow(entries[virtualItem.index], virtualItem.index)}
				</div>
			))}
		</div>
	);
}
