import {useState, useRef, useEffect, Fragment, type ReactNode} from "react";
import {type ComboboxVirtualizer, type ComboboxPositionerProps, Combobox, ComboboxContent, ComboboxInput, ComboboxEmpty, ComboboxVirtualList} from "@/components/ui/combobox.tsx";
import useConstant from "use-constant";
import AwesomeDebouncePromise from "awesome-debounce-promise";
import {ListSourceEntries} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {useAsync} from "react-async-hook";
import {type ListSourceEntry, type ListSourceParams} from "@bindings/bdo-viewer/internal/sources";
import {Loader2} from "lucide-react";
import {EntryIcon} from "@/lib/entry-icon.tsx";
import {tryGetGradeColor} from "@/lib/types/item-grades.ts";
import {useSnapshot} from "valtio/react";
import {useEntryFilterStore} from "@/components/entry-list/filters/entry-filter.ts";

export type EntryListComboPickerProps = {
	params?: Omit<ListSourceParams, "path_parts" | "sub_category" | "category" | "query">;
	/**
	 * Should be shadcn trigger, for example:
	 *
	 *     <ComboboxTrigger
	 * 	    	title={"Add Consumable"}
	 * 	    	className={
	 * 	    		cn(
	 * 	    			"flex flex-col items-center justify-center gap-2 rounded-md border cursor-pointer select-none w-14 h-14",
	 * 	    			"bg-surface-1 hover:bg-surface-2 transition-colors border-dashed border-surface-border",
	 * 	    		)
	 * 	    	}
	 * 	    >
	 * 	    	<FlaskConical className={"size-3.5"} />
	 * 	    </ComboboxTrigger>
	 */
	trigger: ReactNode;

	placeholder?: string;

	positioning?: Pick<ComboboxPositionerProps, "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding">
	onSelect?: (entry: ListSourceEntry) => void;
}

export function EntryListComboPicker(
	{params: ownParams, trigger, placeholder, positioning, onSelect}: EntryListComboPickerProps
) {
	const [open, setOpen] = useState(false);

	// Every picker sits under an EntryFilterProvider, which is what decides whether its search and
	// filters are its own or shared with siblings.
	const store   = useEntryFilterStore();
	const filters = useSnapshot(store);

	const virtualizerRef  = useRef<ComboboxVirtualizer | null>(null);
	const scrollOffsetRef = useRef(0);
	const lastEntries     = useRef<ListSourceEntry[]>([]);

	const debouncedList = useConstant(
		() => AwesomeDebouncePromise(ListSourceEntries, 150)
	);

	const params    = filters.resolve(ownParams);
	const paramsKey = JSON.stringify(params);

	// Any change to what's being searched gives a different (usually shorter) list, so a restored
	// offset would drop the user somewhere arbitrary in it — start at the top instead.
	useEffect(() => {
		scrollOffsetRef.current = 0;
	}, [paramsKey, filters.query]);

	// A closed picker keeps its last results (so reopening renders instantly) but stops querying —
	// otherwise every picker sharing this store would refetch on each keystroke.
	const search = useAsync(
		async () => {
			if (!open) {
				return lastEntries.current;
			}
			lastEntries.current = await debouncedList({...params, query : filters.query}) ?? [];
			return lastEntries.current;
		},
		// paramsKey stands in for params' content; debouncedList is stable.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[open, filters.query, debouncedList, paramsKey],
		{setLoading : state => ({...state, status : "loading", loading : true})},
	);

	const entries    = search.result ?? [];
	const refreshing = search.loading && entries.length > 0;

	return (
		<Combobox
			virtualized
			items={entries}
			value={null}
			filter={null}
			open={open}
			onOpenChange={setOpen}
			loopFocus={true}
			inputValue={filters.query}
			onInputValueChange={(next, {reason}) => {
				// base-ui clears its input programmatically on close (reason "input-clear");
				// ignore that so the search persists across reopen — only real typing counts.
				if (reason !== "input-change") {
					return;
				}
				store.query = next;
			}}
			itemToStringLabel={(e: ListSourceEntry) => e.title}
			onValueChange={(entry: ListSourceEntry | null) => {
				if (entry) {
					onSelect?.(entry);
				}
			}}
			// Virtualized rows are absolutely positioned, so base-ui can't scroll the
			// highlighted one into view on its own — nudge the virtualizer at the edges.
			onItemHighlighted={(item, {reason, index}) => {
				const v = virtualizerRef.current;
				if (!item || !v) {
					return;
				}
				const isEnd        = index === v.options.count - 1;
				const shouldScroll = reason === "none" || (reason === "keyboard" && (index === 0 || isEnd));
				if (shouldScroll) {
					queueMicrotask(() => v.scrollToIndex(index, {align : isEnd ? "start" : "end"}));
				}
			}}
		>
			{trigger}
			<ComboboxContent
				className="w-72 "
				{...(positioning || {})}
			>
				<ComboboxInput placeholder={placeholder} showTrigger={false} className="text-xs" />
				{store.controls.length > 0 && (
					<div data-slot={"combobox-toolbar"}>
						{store.controls.map(control => (
							<Fragment key={control.id}>
								{control.render({
									value : filters.getValue(control) as never,
									set   : next => store.setValue(control, next),
									open,
								})}
							</Fragment>
						))}
					</div>
				)}
				{refreshing && (
					<Loader2 className="pointer-events-none absolute right-3 top-3 size-4 animate-spin text-fg-subtle" />
				)}
				<ComboboxEmpty>{search.loading ? "Searching…" : "No results."}</ComboboxEmpty>
				<ComboboxVirtualList<ListSourceEntry> open={open} virtualizerRef={virtualizerRef} scrollOffsetRef={scrollOffsetRef}>
					{entry => {
						return (
							<div className={"flex items-center gap-2"}>
								{entry.icon && (
									<EntryIcon urn={entry.urn} grade={entry.extra?.grade} imageClass={"size-5"} className={"min-w-0 gap-2"} />
								)}
								<span
									className={"flex-1 min-w-0 truncate text-xs"}
									style={(() => {
										const c = tryGetGradeColor(entry.extra?.grade);
										return c ? {color : c.toString()} : undefined;
									})()}
								>
									{entry.title}
								</span>
							</div>
						);
					}}
				</ComboboxVirtualList>
			</ComboboxContent>
		</Combobox>
	);
}
