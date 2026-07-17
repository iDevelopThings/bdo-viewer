import {X} from "lucide-react";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {cn} from "@/lib/utils.ts";
import {useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import Color from "color";
import {getGradeColor} from "@/lib/types/item-grades.ts";

export type GearSlotButtonVariant = "xs" | "sm" | "md"

export function GearSlotButton({slotId, size = "md"}: {
	slotId?: SlotName,
	size?: GearSlotButtonVariant
}) {
	const [builder, s] = useGearBuilderStore();

	if (slotId === undefined || slotId === null) {
		return null;
	}

	const slot = builder.slots[slotId];
	if (!slot || !slot.info) {
		return null;
	}
	const item = slot.item;

	const gradeColor = getGradeColor(item?.grade);
	const selected   = builder.selectedSlot?.id === slot.id;

	return (
		<div
			className={cn(
				"relative flex flex-col items-center justify-center gap-1 rounded-md border cursor-pointer select-none",
				size === "xs" && "w-12 h-12",
				size === "sm" && "w-13 h-13",
				size === "md" && "w-16 h-16",
				"bg-zinc-900 hover:bg-zinc-800 transition-colors",
				item ? "border-zinc-700" : "border-dashed border-zinc-700",
				selected && "ring-2 ring-zinc-500",
			)}
			style={gradeColor ? {
				borderColor : gradeColor.toString(),
			} : undefined}
			title={slot.info.Title}
			onClick={() => {
				if (item) {
					s.selectedSlot = slot.id;
				} else {
					s.openPicker(slot.id);
				}
			}}
		>
			{item ? (
				<div
					style={gradeColor ? {
						width          : "100%",
						height         : "100%",
						alignItems     : "center",
						justifyContent : "center",
						display        : "flex",
						background     : `radial-gradient(circle, ${Color(gradeColor).alpha(0.8)} 0%, ${Color(gradeColor).darken(0.5).alpha(0.5)} 40%, transparent 90%)`,
					} : undefined}
				>
					<ItemIcon urn={item.urn} className={"shrink-0"} imageClass={cn(
						size === "sm" ? "w-8 h-8" : "w-10 h-10",
					)} />
					{slot.enhanceLevel > 0 && slot.enhancement && (
						<span className={"absolute top-0.5 left-1 text-[10px] font-semibold text-amber-300 pointer-events-none"}>
							{slot.enhancement.name}
						</span>
					)}
					<button
						className={"absolute top-0.5 right-0.5 p-0.5 rounded text-zinc-300 hover:text-white hover:bg-zinc-500"}
						onClick={e => {
							e.stopPropagation();
							void s.unequip(slot.id);
						}}
					>
						<X className={"size-3"} />
					</button>
				</div>
			) : (
				<span className={cn(
					"text-zinc-500 text-center px-1 leading-tight",
					size === "xs" && "text-[8px]",
					size === "sm" && "text-[9px]",
					size === "md" && "text-[11px]",
				)}>
					{slot.info.Title}
				</span>
			)}
		</div>
	);
}
