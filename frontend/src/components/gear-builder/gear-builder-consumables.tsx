import {useRef, useState} from "react";
import {Loader2, FlaskConical} from "lucide-react";
import {useAsync} from "react-async-hook";
import useConstant from "use-constant";
import AwesomeDebouncePromise from "awesome-debounce-promise";
import {AddConsumable, RemoveConsumable} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {ListSourceEntries} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {type ListSourceEntry, SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {ItemIconImage} from "@/lib/item-icon.tsx";
import {tryGetGradeColor} from "@/lib/types/item-grades.ts";
import {Item, BuffStackingCategory} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import type {MaybeReadonly} from "@/types.ts";
import {useSnapshot} from "valtio/react";
import type {ComboboxVirtualizer} from "@/components/ui/combobox.tsx";
import {Combobox, ComboboxTrigger, ComboboxContent, ComboboxInput, ComboboxEmpty, ComboboxVirtualList} from "@/components/ui/combobox.tsx";
import {cn} from "@/lib/utils.ts";
import {ItemSlotButton} from "@/components/gear-builder/gear-slot-button.tsx";

// Consumable buff families (BuffStackingCategory) → short display label.
const BUFF_FAMILY: Record<BuffStackingCategory, string> = {
	[BuffStackingCategory.$zero]                                   : "",
	[BuffStackingCategory.BuffStackingCategoryFood]                : "Food",
	[BuffStackingCategory.BuffStackingCategoryDraughtResetControl] : "Draught",
	[BuffStackingCategory.BuffStackingCategoryPerfume]             : "Perfume",
	[BuffStackingCategory.BuffStackingCategoryCronMealExtra]       : "Cron",
	[BuffStackingCategory.BuffStackingCategoryElixir]              : "Elixir",
	[BuffStackingCategory.BuffStackingCategoryWhaleTendonElixir]   : "Whale Tendon",
};

// consumableFamily reads the item's broad buff family from its effect stats.
// eslint-disable-next-line react-refresh/only-export-components
export function consumableFamily(item: MaybeReadonly<Item>): string | undefined {
	for (let i = item?.effects?.buffCategories.length - 1; i >= 0; i--) {
		const type = item?.effects?.buffCategories[i];
		if (BUFF_FAMILY[type] != null) {
			return BUFF_FAMILY[type];
		}
	}

	return undefined;
}

export function ConsumablesRow() {
	const {consumables} = useSnapshot(gearBuilderStore);

	return (

		<div className={"flex flex-col gap-2 items-center"}>
			{consumables?.map(item => {
				return <ItemSlotButton
					key={item?.urn}
					item={{
						id    : item?.id,
						title : item?.name,
						urn   : item?.urn,
						icon  : item?.icon,
						extra : {
							grade : item?.grade
						}
					}}
					size={"sm"}
					slotTitle={item?.name}
					enhanceTitle={consumableFamily(item)}
					onRemove={() => item && RemoveConsumable(item.urn)}
				/>;
			})}

			<ConsumablePicker />
		</div>

	);
}

export function ConsumablePicker() {
	const [open, setOpen]           = useState(false);
	const [hasOpened, setHasOpened] = useState(false);
	const [query, setQuery]         = useState("");
	const virtualizerRef            = useRef<ComboboxVirtualizer | null>(null);
	const scrollOffsetRef           = useRef(0);

	const debouncedList = useConstant(
		() => AwesomeDebouncePromise(ListSourceEntries, 150)
	);

	// Gate on hasOpened (not open) so results survive closing — reopening the same
	// query shows the prior list instantly, which is what lets the scroll restore.
	const search = useAsync(
		() => hasOpened ? debouncedList({
			query,
			source   : SourceKind.Item,
			sort     : "consumable",
			sort_dir : "asc",
			filters  : {
				consumable : true
			},
		}) : Promise.resolve([]),
		[hasOpened, query, debouncedList],
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
			onOpenChange={next => {
				setOpen(next);
				if (next) {
					setHasOpened(true);
				}
			}}
			inputValue={query}
			onInputValueChange={(next, {reason}) => {
				// base-ui clears its input programmatically on close (reason "input-clear");
				// ignore that so the search persists across reopen. Only real typing updates
				// the query — and a fresh query starts the list back at the top.
				if (reason !== "input-change") {
					return;
				}
				setQuery(next);
				scrollOffsetRef.current = 0;
			}}
			itemToStringLabel={(e: ListSourceEntry) => e.title}
			onValueChange={(entry: ListSourceEntry | null) => {
				if (entry) {
					void AddConsumable(entry.urn);
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
			<ComboboxTrigger
				title={"Add Consumable"}
				className={
					cn(
						"flex flex-col items-center justify-center gap-2 rounded-md border cursor-pointer select-none w-14 h-14",
						"bg-surface-1 hover:bg-surface-2 transition-colors border-dashed border-surface-border",
					)
				}
			>
				<FlaskConical className={"size-3.5"} />
			</ComboboxTrigger>
			<ComboboxContent className="w-72">
				<ComboboxInput placeholder="Search items…" showTrigger={false} className="text-xs" />
				{refreshing && (
					<Loader2 className="pointer-events-none absolute right-3 top-3 size-4 animate-spin text-fg-subtle" />
				)}
				<ComboboxEmpty>{search.loading ? "Searching…" : "No items found."}</ComboboxEmpty>
				<ComboboxVirtualList<ListSourceEntry> open={open} virtualizerRef={virtualizerRef} scrollOffsetRef={scrollOffsetRef}>
					{entry => {
						return (
							<div className={"flex items-center gap-2"}>
								{entry.icon && (
									<ItemIconImage urn={entry.urn} grade={entry.extra?.grade} imageClass={"size-5"} />
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


