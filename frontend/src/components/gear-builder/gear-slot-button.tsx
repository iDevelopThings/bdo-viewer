import {X, LucideLock} from "lucide-react";
import {EntryIcon} from "@/lib/entry-icon.tsx";
import {cn, cj} from "@/lib/utils.ts";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import type {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {getGradeColorScale} from "@/lib/types/item-grades.ts";
import {useSnapshot} from "valtio/react";
import {type ListSourceEntry, SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {type ComponentPropsWithoutRef, forwardRef, memo, useCallback, type ReactNode} from "react";
import {setHighlightSource} from "@/components/gear-builder/stat-highlight.ts";
import {ComboboxTriggerNoChevron} from "@/components/ui/combobox.tsx";
import type {SimpleSlotData as Slot} from "@bindings/bdo-viewer/internal/gear";
import {type EntryListComboPickerProps, EntryListComboPicker} from "@/components/entry-list/entry-list-combo-picker.tsx";
import {EntryFilterProvider} from "@/components/entry-list/filters/entry-filter-provider.tsx";

export type GearSlotButtonVariant = "xs" | "sm" | "md" | "lg" | "xl"

// Root props are forwarded so base-ui can drive this as a trigger via `render={<ItemSlotButton />}`.
export type ItemSlotButtonProps = ComponentPropsWithoutRef<"div"> & {
	item?: ListSourceEntry
	size?: GearSlotButtonVariant
	slotTitle?: string
	enhanceTitle?: string
	selected?: boolean
	lockedByItem?: ListSourceEntry
	onRemove?: (item: ListSourceEntry | undefined) => void
	onHoverChange?: (hovered: boolean) => void
	backgroundIcon?: string
	// Shown in place of the slot title while the slot is empty (an add icon, usually).
	placeholder?: ReactNode
}

export const ItemSlotButton = memo(forwardRef<HTMLDivElement, ItemSlotButtonProps>(function ItemSlotButton(
	{item, slotTitle, enhanceTitle, onRemove, onHoverChange, selected, lockedByItem, className, backgroundIcon, placeholder, size = "md", ...rest},
	ref
) {
	const grade = getGradeColorScale(item?.extra?.grade);

	const disabled = lockedByItem !== undefined;

	if (lockedByItem && !item) {
		item = lockedByItem;
	}


	return (
		<div
			ref={ref}
			{...rest}
			onMouseEnter={e => {
				rest.onMouseEnter?.(e);
				onHoverChange?.(true);
				setHighlightSource(item?.urn ?? null);
			}}
			onMouseLeave={e => {
				rest.onMouseLeave?.(e);
				onHoverChange?.(false);
				setHighlightSource(null);
			}}

			className={cj([
				"relative flex flex-col items-center justify-center gap-1 rounded-md border select-none",
				"bg-surface-1 transition-colors",
				disabled && [
					"opacity-50 cursor-not-allowed"
				],
				!disabled && [
					"cursor-pointer hover:bg-surface-2",
					selected && "ring-2 ring-fg-subtle",
				],

				size === "xs" && "w-8 h-8",
				size === "sm" && "w-9 h-9",
				size === "md" && "w-10 h-10",
				size === "lg" && "w-12 h-12",
				size === "xl" && "w-14 h-14",

				item ? "border-surface-border" : "border-dashed border-surface-border",

				className
			])}
			style={grade ? {
				borderColor : grade.color.toString(),
			} : undefined}
			title={slotTitle}
			onClick={e => {
				if (disabled) {
					return;
				}
				rest.onClick?.(e);
			}}
		>
			{item ? (
				<div
					style={grade ? {
						width          : "100%",
						height         : "100%",
						alignItems     : "center",
						justifyContent : "center",
						display        : "flex",
						background     : `radial-gradient(circle, ${grade.itemBackground[0]} 0%, ${grade.itemBackground[1]} 40%, transparent 90%)`,
					} : undefined}
				>
					<EntryIcon urn={item.urn} className={"shrink-0"} imageClass={cn(
						size === "sm" ? "w-8 h-8" : "w-10 h-10",
						disabled && "opacity-75"
					)} />
					{enhanceTitle && (
						<span className={"absolute bottom-0.5 left-1 text-[7px] text-shadow-sm font-semibold text-amber-300 pointer-events-none"}>
							{enhanceTitle}
						</span>
					)}
					{lockedByItem && (
						<div className={"absolute top-0 left-0 flex items-center justify-center w-full h-full"}>
							<LucideLock className={"text-[10px] text-fg-muted/70 pointer-events-none"} />
						</div>
					)}
					{!disabled && onRemove && (
						<button
							className={"absolute top-0.5 right-0.5 p-0.5 rounded text-fg-muted hover:text-fg hover:bg-surface-3"}
							onClick={e => {
								e.stopPropagation();
								onRemove(item);
							}}
						>
							<X className={"size-3"} />
						</button>
					)}
				</div>
			) : (
				<div style={{
					backgroundImage    : backgroundIcon ? `url(${backgroundIcon})` : undefined,
					backgroundSize     : "contain",
					backgroundRepeat   : "no-repeat",
					backgroundPosition : "center",
					width              : "100%",
					height             : "100%",
					display            : "flex",
					alignItems         : "center",
					justifyContent     : "center",
				}}>
					{placeholder ?? (!backgroundIcon && <span className={cn(
						"text-fg-subtle text-center px-1 leading-tight",
						size === "xs" && "text-[8px]",
						size === "sm" && "text-[9px]",
						size === "md" && "text-[11px]",
					)}>
						{slotTitle}
					</span>)}
				</div>
			)}
		</div>
	);
}));

// Scopes the generic entry picker to one gear slot: the slot's equip slots + the build's class.
export function GearSlotPicker({slot, trigger, positioning}: {
	slot: Slot
	trigger: ReactNode
	positioning?: EntryListComboPickerProps["positioning"]
}) {
	const {selectedClass} = useSnapshot(gearBuilderStore);

	return (
		<EntryFilterProvider
			params={{
				source   : SourceKind.Item,
				sort     : "grade",
				sort_dir : "desc",
				filters  : {
					equipSlots : [slot.info.SlotName],
					class      : selectedClass?.Name,
				},
			}}
		>
			<EntryListComboPicker
				trigger={trigger}
				placeholder={`Search ${slot.info.Title}…`}
				positioning={positioning}
				onSelect={entry => void gearBuilderStore.equip(entry.urn, slot.id)}
			/>
		</EntryFilterProvider>
	);
}

export function GearSlotButton({slotId, size = "md"}: {
	slotId?: SlotName,
	size?: GearSlotButtonVariant
}) {
	const {slots, selectedSlot, highlightSlots} = useSnapshot(gearBuilderStore);

	const slot = slotId != null ? slots[slotId] : undefined;

	const highlight = slotId != null ? highlightSlots[slotId] : undefined;

	// Read from the raw store rather than the snapshot so this callback stays stable across
	// loadout changes (the snapshot's slots/slot change identity on every update).
	const onHoverChange = useCallback((hovered: boolean) => {
		if (slotId == null) {
			return;
		}
		const s = gearBuilderStore.slots[slotId];
		if (!s) {
			return;
		}
		if (s.lockedBy != null) {
			gearBuilderStore.setHoverState(s.id, s.lockedBy, hovered, "locker");
			return;
		}
		gearBuilderStore.slots
			.filter(x => x.lockedBy === slotId)
			.forEach(x => gearBuilderStore.setHoverState(s.id, x.id, hovered, "locked"));
	}, [slotId]);

	const onSlotClick = useCallback(() => {
		if (slotId != null) {
			gearBuilderStore.selectedSlot = slotId;
		}
	}, [slotId]);

	const onSlotRemove = useCallback((removed?: ListSourceEntry) => {
		if (slotId != null && removed) {
			void gearBuilderStore.unequip(slotId);
		}
	}, [slotId]);

	if (!slot) {
		return null;
	}
	const item = slot.item;

	const lockedByItem = slot.lockedBy ? slots[slot.lockedBy].item ?? undefined : undefined;

	const button = (
		<ItemSlotButton
			onClick={onSlotClick}
			item={item ?? undefined}
			slotTitle={slot.info.Title}
			enhanceTitle={slot.enhancementTitle}
			selected={selectedSlot?.id === slot.id}
			size={size}
			lockedByItem={lockedByItem}
			onRemove={onSlotRemove}
			onHoverChange={onHoverChange}
			backgroundIcon={`/equipment/${slot.info.Name}.png`}

			className={cn([
				highlight?.reason === "locker" && "ring-2 ring-amber-400",
				highlight?.reason === "locked" && "ring-2 ring-rose-400",
			])}
		/>
	);

	// Only an empty slot picks: a filled one selects instead, so the detail panel takes over
	// (change it from there). A locked slot mirrors its locker's item, so it has nothing to pick.
	if (item || lockedByItem) {
		return button;
	}

	return (
		<GearSlotPicker
			slot={slot}
			positioning={{
				side             : "right",
				align            : "start",
				collisionPadding : 8,
			}}
			trigger={
				<ComboboxTriggerNoChevron nativeButton={false} render={button} />
			}
		/>
	);
}
