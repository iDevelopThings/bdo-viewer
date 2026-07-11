import {GEAR_SLOTS_BY_ID} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {type Grade, grades} from "@/types.ts";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";

function StatValue({label, value}: { label: string, value: string | number | undefined }) {
	if (value === undefined || value === 0 || value === "") {
		return null;
	}

	return (
		<div className={"flex flex-col items-center gap-0.5"}>
			<span className={"text-xs text-zinc-400 uppercase"}>{label}</span>
			<span className={"text-sm font-semibold"}>{value}</span>
		</div>
	);
}

export function GearSlotDetail() {
	const [store, snap] = useGearBuild();

	const slotId = snap.selectedSlot;
	if (!slotId) {
		return null;
	}

	const def  = GEAR_SLOTS_BY_ID[slotId];
	const item = snap.itemFor(slotId);
	if (!def || !item) {
		return null;
	}

	const slot       = snap.slots[slotId];
	const enchant    = snap.enchantFor(slotId);
	const minLevel   = snap.minLevelFor(slotId);
	const maxLevel   = snap.maxLevelFor(slotId);
	const gradeColor = item.grade ? grades[item.grade as Grade]?.color : undefined;

	return (
		<div className={"flex flex-col gap-4 border-t border-zinc-800 p-4"}>
			<div className={"flex flex-row items-center gap-3"}>
				<img src={`/icons/icons/${item.id}.png`} alt={item.name} className={"w-8 h-8 shrink-0"} />
				<div className={"flex flex-col min-w-0"}>
					<span className={"font-semibold truncate"} style={gradeColor ? {color : gradeColor} : undefined}>
						{item.name}
					</span>
					<span className={"text-xs text-zinc-400"}>{def.label}</span>
				</div>
				<div className={"flex flex-row gap-1 ml-auto"}>
					<Button
						variant={"outline"}
						size={"xs"}
						onClick={() => store.openPicker(slotId)}
					>
						Change
					</Button>
					<Button
						variant={"ghost"}
						size={"xs"}
						onClick={() => store.unequip(slotId)}
					>
						Unequip
					</Button>
				</div>
			</div>

			{maxLevel > minLevel && (
				<div className={"flex flex-col gap-4 max-w-4/6"}>
					<div className="flex items-center gap-6">
						<Label>Enhance Level</Label>
						<span className="text-sm text-muted-foreground">
							{enchant?.name ?? "Base"} ({slot.level})
						</span>
					</div>
					<Slider
						value={slot.level}
						onValueChange={(value) => {
							store.setLevel(slotId, value as number);
						}}
						min={minLevel}
						max={maxLevel}
						step={1}
					/>
				</div>
			)}

			{enchant && (
				<div className={"flex flex-row flex-wrap gap-6"}>
					<StatValue label={"AP"} value={
						enchant.apMin !== undefined && enchant.apMax !== undefined && enchant.apMin !== enchant.apMax
							? `${enchant.apMin} ~ ${enchant.apMax}`
							: enchant.ap
					} />
					<StatValue label={"DP"} value={enchant.dp} />
					<StatValue label={"Evasion"} value={enchant.evasion} />
					<StatValue label={"DR"} value={enchant.damageReduction} />
					<StatValue label={"HP"} value={enchant.maxHp} />
					<StatValue label={"Durability"} value={enchant.durability} />
				</div>
			)}
		</div>
	);
}
