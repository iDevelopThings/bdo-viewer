import {useEffect, useState} from "react";
import {CancelError} from "@wailsio/runtime";
import {GetStatsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import {GEAR_SLOTS_BY_ID} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {type Grade, grades} from "@/types.ts";
import {ItemURN} from "@/lib/urn.ts";
import {flatStats, namedGroups} from "@/lib/stat-groups.ts";
import {StatCard} from "@/components/details/stats.tsx";
import {EffectSections} from "@/components/details/effects.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";

// SlotStats pulls the fully-resolved stats for an item at a given enhance level +
// Caphras step from the backend (GetStatsByURN) — the same source and rendering the
// details panel uses, so the numbers match and reflect Caphras. Its own child so the
// fetch hooks sit past GearSlotDetail's guards.
function SlotStats({itemId, level, caphras}: {itemId: number; level: number; caphras: number}) {
	const [groups, setGroups] = useState<StatGroup[]>([]);

	useEffect(() => {
		let cancelled = false;
		GetStatsByURN(ItemURN.new(itemId), level, caphras).then(
			result => {
				if (!cancelled) {
					setGroups(result ?? []);
				}
			},
			e => {
				if (!cancelled && !(e instanceof CancelError)) {
					console.error("GearSlotDetail: failed to load stats", e);
				}
			},
		);
		return () => {
			cancelled = true;
		};
	}, [itemId, level, caphras]);

	// flatStats is only the untitled card row (AP/DP/basics); the titled sections
	// (Enhancement Effect, Set Effect, Caphras Enhancement, Hidden, …) come from
	// namedGroups — render both, exactly like the details panel.
	const cards    = flatStats(groups);
	const sections = namedGroups(groups);
	if (cards.length === 0 && sections.length === 0) {
		return null;
	}

	return (
		<div className={"flex flex-col gap-4"}>
			{cards.length > 0 && (
				<div className={"flex flex-row items-center flex-wrap gap-4"}>
					{cards.map(stat => (
						<StatCard key={stat.title} title={stat.title} value={stat.value} />
					))}
				</div>
			)}
			{sections.length > 0 && <EffectSections groups={sections} />}
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
	const maxCaphras = snap.maxCaphrasFor(slotId);
	const gradeColor = item.grade ? grades[item.grade as Grade]?.color : undefined;

	return (
		<div className={"flex flex-col gap-4 border-t border-zinc-800 p-4"}>
			<div className={"flex flex-row items-center gap-3"}>
				<img src={`/icons/icons/${item.id}.webp`} alt={item.name} className={"w-8 h-8 shrink-0"} />
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

			{maxCaphras > 0 && (
				<div className={"flex flex-col gap-4 max-w-4/6"}>
					<div className="flex items-center gap-6">
						<Label>Caphras</Label>
						<span className="text-sm text-muted-foreground">
							Level {slot.caphras} / {maxCaphras}
						</span>
					</div>
					<Slider
						value={slot.caphras}
						onValueChange={(value) => {
							store.setCaphras(slotId, value as number);
						}}
						min={0}
						max={maxCaphras}
						step={1}
					/>
				</div>
			)}

			<SlotStats itemId={item.id} level={slot.level} caphras={slot.caphras} />
		</div>
	);
}
