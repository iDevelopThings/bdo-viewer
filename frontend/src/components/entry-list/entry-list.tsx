import {type MouseEvent, type MutableRefObject, type ReactNode, useCallback} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import {ArrowDown, ArrowUp} from "lucide-react";
import {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {DeepReadonly} from "@/types.ts";
import {cn} from "@/lib/utils.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {tryGetGradeColor} from "@/lib/types/item-grades.ts";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {Button} from "@/components/ui/button.tsx";


// SortOption mirrors the Go sources.SortOption surfaced on each source's
// BaseSource.Sorts (GetAllSources); the sort dropdown is driven by these so
// items can offer Grade/Weight while other sources offer just Name.
export type SortOption = { key: string; label: string };
export type SortDir = "asc" | "desc";

export type SortControlsProps = {
	sorts: readonly SortOption[],
	sortKey: string | undefined,
	dir: SortDir,
	onChange: (key: string, dir: SortDir) => void,
	className?: string,
}

// SortControls is the source-driven sort picker: a type dropdown fed from the
// source's Sorts plus a direction toggle. Renders nothing when the source
// offers no orderings.
export function SortControls({sorts, sortKey, dir, onChange, className}: SortControlsProps) {
	if (!sorts.length) {
		return null;
	}

	const active = sorts.some(s => s.key === sortKey) ? sortKey! : sorts[0].key;

	return (
		<div className={cn("flex flex-row items-center gap-1", className)} data-testid={"sort-controls"}>
			<Select value={active} onValueChange={(v) => onChange(v as string, dir)}>
				<SelectTrigger className={"w-fit"} data-testid={"sort-key"} title={"Sort by"}>
					<SelectValue>
						{(v: string) => sorts.find(s => s.key === v)?.label ?? v}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{sorts.map(s => (
						<SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type={"button"}
				variant={"outline"}
				size={"icon"}
				data-testid={"sort-dir"}
				data-dir={dir}
				onClick={() => onChange(active, dir === "asc" ? "desc" : "asc")}
				title={dir === "asc" ? "Ascending" : "Descending"}
			>
				{dir === "asc" ? <ArrowUp /> : <ArrowDown />}
			</Button>
		</div>
	);
}

export type EntryRowBaseProps = {
	entry: DeepReadonly<ListSourceEntry>;
	active?: boolean;
	badge?: ReactNode;
	onClick?: (e: MouseEvent) => void;
	onAuxClick?: (e: MouseEvent) => void;
};

export function EntryRowBase({entry, active, badge, onClick, onAuxClick}: EntryRowBaseProps) {
	const gradeColor = tryGetGradeColor(entry?.extra?.grade);

	return (
		<div
			data-active={active ?? false}
			data-testid={"entry-row"}
			data-urn={entry.urn}
			className={cn(
				"flex flex-row items-center gap-4 p-2 hover:bg-surface-2 cursor-pointer",
				"data-[active=true]:bg-surface-3",
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
				<div className={"flex-1 truncate"} style={gradeColor ? {color : gradeColor.toString()} : undefined}>
					{entry.title}
				</div>
				{entry.subtitle && (
					<div className={"text-xs text-fg-subtle truncate"}>
						{entry.subtitle}
					</div>
				)}
			</div>
			{badge}
		</div>
	);
}

// EntrySourceBadge labels which source a row came from - only meaningful in the
// mixed results of a global search.
export function EntrySourceBadge({source}: { source: string }) {
	return (
		<span className={"shrink-0 rounded-sm border border-surface-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-subtle"}>
			{source}
		</span>
	);
}

export type VirtualEntryListProps = {
	loading: boolean;
	entries: DeepReadonly<ListSourceEntry[]>;
	parentRef: MutableRefObject<HTMLDivElement | null>;
	renderRow: (entry: DeepReadonly<ListSourceEntry>, index: number) => ReactNode;
	emptyMessage?: string;
};

export function VirtualEntryList({loading, entries, parentRef, renderRow, emptyMessage}: VirtualEntryListProps) {
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

	// eslint-disable-next-line react-hooks/incompatible-library
	const rowVirtualizer = useVirtualizer({
		count                               : entries.length,
		getScrollElement,
		estimateSize,
		getItemKey,
		useAnimationFrameWithResizeObserver : true,
		overscan                            : 8,
	});

	if (loading) {
		return <div className={"p-4 text-sm text-fg-subtle text-center w-full"}>Loading...</div>;
	}

	if (entries.length === 0) {
		return <div className={"p-4 text-sm text-fg-subtle text-center w-full"}>{emptyMessage ?? "No entries found"}</div>;
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
