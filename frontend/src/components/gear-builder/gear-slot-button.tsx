import {X} from "lucide-react";
import {type GearSlotDef} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {type Grade, grades} from "@/types.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {cn} from "@/lib/utils.ts";

export function GearSlotButton({def, size = "md"}: { def: GearSlotDef, size?: "sm" | "md" }) {
	const [store, snap] = useGearBuild();

	const slot       = snap.slots[def.id];
	const item       = snap.itemFor(def.id);
	const gradeColor = item?.grade ? grades[item.grade as Grade]?.color : undefined;
	const selected   = snap.selectedSlot === def.id;

	return (
		<div
			className={cn(
				"relative flex flex-col items-center justify-center gap-1 rounded-md border cursor-pointer select-none",
				size === "sm" ? "w-16 h-16" : "w-20 h-20",
				"bg-zinc-900 hover:bg-zinc-800 transition-colors",
				item ? "border-zinc-700" : "border-dashed border-zinc-700",
				selected && "ring-2 ring-zinc-500",
			)}
			style={gradeColor ? {borderColor : gradeColor} : undefined}
			title={def.label}
			onClick={() => {
				if (item) {
					store.selectSlot(def.id);
				} else {
					store.openPicker(def.id);
				}
			}}
		>
			{item ? (
				<>
					<ItemIcon urn={item.urn} className={"shrink-0"} imageClass={size === "sm" ? "w-8 h-8" : "w-10 h-10"} />
					{slot.level > 0 && (
						<span className={"absolute top-0.5 left-1 text-[10px] font-semibold text-amber-300 pointer-events-none"}>
							{snap.enchantFor(def.id)?.name}
						</span>
					)}
					<button
						className={"absolute top-0.5 right-0.5 p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-700"}
						onClick={e => {
							e.stopPropagation();
							store.unequip(def.id);
						}}
					>
						<X className={"size-3"} />
					</button>
				</>
			) : (
				<span className={"text-[10px] text-zinc-500 text-center px-1 leading-tight"}>
					{def.label}
				</span>
			)}
		</div>
	);
}
