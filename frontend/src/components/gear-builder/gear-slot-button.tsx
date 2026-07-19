import {X, LucideLock} from "lucide-react";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {cn, cj} from "@/lib/utils.ts";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {getGradeColorScale} from "@/lib/types/item-grades.ts";
import {useSnapshot} from "valtio/react";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {memo, useCallback} from "react";
import {setHighlightSource} from "@/components/gear-builder/stat-highlight.ts";

export type GearSlotButtonVariant = "xs" | "sm" | "md"

export const ItemSlotButton = memo(function ItemSlotButton(
	{item, slotTitle, enhanceTitle, onClick, onRemove, onHoverChange, selected, lockedByItem, className, size = "md"}:
	{
		item?: ListSourceEntry
		size?: GearSlotButtonVariant
		slotTitle?: string
		enhanceTitle?: string
		selected?: boolean
		lockedByItem?: ListSourceEntry
		onClick?: (item: ListSourceEntry | undefined) => void
		onRemove?: (item: ListSourceEntry | undefined) => void
		onHoverChange?: (hovered: boolean) => void
		className?: string
	}
) {
	const grade = getGradeColorScale(item?.extra?.grade);

	const disabled = lockedByItem !== undefined;

	if (lockedByItem && !item) {
		item = lockedByItem;
	}


	return (
		<div
			onMouseEnter={() => {
				onHoverChange?.(true);
				setHighlightSource(item?.urn ?? null);
			}}
			onMouseLeave={() => {
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

				size === "xs" && "w-12 h-12",
				size === "sm" && "w-13 h-13",
				size === "md" && "w-16 h-16",

				item ? "border-surface-border" : "border-dashed border-surface-border",

				className
			])}
			style={grade ? {
				borderColor : grade.color.toString(),
			} : undefined}
			title={slotTitle}
			onClick={() => {
				if (disabled) {
					return;
				}
				onClick?.(item);
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
					<ItemIcon urn={item.urn} className={"shrink-0"} imageClass={cn(
						size === "sm" ? "w-8 h-8" : "w-10 h-10",
						disabled && "opacity-75"
					)} />
					{enhanceTitle && (
						<span className={"absolute top-0.5 left-1 text-[10px] font-semibold text-amber-300 pointer-events-none"}>
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
								onRemove?.(item);
							}}
						>
							<X className={"size-3"} />
						</button>
					)}
				</div>
			) : (
				<span className={cn(
					"text-fg-subtle text-center px-1 leading-tight",
					size === "xs" && "text-[8px]",
					size === "sm" && "text-[9px]",
					size === "md" && "text-[11px]",
				)}>
					{slotTitle}
				</span>
			)}
		</div>
	);
});

export function GearSlotButton({slotId, size = "md"}: {
	slotId?: SlotName,
	size?: GearSlotButtonVariant
}) {
	const {slots, selectedSlot, highlightSlots} = useSnapshot(gearBuilderStore);

	const slot = slots?.[slotId] ?? undefined;

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

	const onSlotClick = useCallback((clicked?: ListSourceEntry) => {
		if (slotId == null) {
			return;
		}
		if (clicked) {
			gearBuilderStore.selectedSlot = slotId;
		} else {
			gearBuilderStore.openPicker(slotId);
		}
	}, [slotId]);

	const onSlotRemove = useCallback((removed?: ListSourceEntry) => {
		if (slotId != null && removed) {
			void gearBuilderStore.unequip(slotId);
		}
	}, [slotId]);

	if (!slot || !slot.info) {
		return null;
	}
	const item = slot.item;

	const lockedByItem = slot.lockedBy ? slots[slot.lockedBy]?.item : undefined;

	return (
		<ItemSlotButton
			item={item}
			slotTitle={slot.info.Title}
			enhanceTitle={slot.enhancementTitle}
			selected={selectedSlot?.id === slot.id}
			size={size}
			lockedByItem={lockedByItem}
			onClick={onSlotClick}
			onRemove={onSlotRemove}
			onHoverChange={onHoverChange}

			className={cn([
				highlight?.reason === "locker" && "ring-2 ring-amber-400",
				highlight?.reason === "locked" && "ring-2 ring-rose-400",
			])}
		/>
	);
}
