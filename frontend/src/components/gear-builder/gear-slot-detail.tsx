import {useEffect, useState} from "react";
import {CancelError} from "@wailsio/runtime";
import {GetStatsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import {ItemURN} from "@/lib/urn.ts";
import {flatStats, namedGroups} from "@/lib/stat-groups.ts";
import {StatCard} from "@/components/details/stats.tsx";
import {EffectSections} from "@/components/details/effects.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {getGradeColor} from "@/lib/types/item-grades.ts";
import {useDebounce} from "@/utils.tsx";


function SlotStats({itemId, level, caphras}: { itemId: number; level: number; caphras: number }) {
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
	const [builder, s] = useGearBuilderStore();


	const upgrade = useDebounce(l => s.upgrade(slot.id, l), 50);

	const applyUpgrade = (l: number) => {
		s.slots[slot.id].enhanceLevel = l;
		upgrade(l);
	};

	const slot = builder.selectedSlot;
	if (!slot) {
		return null;
	}

	const item = slot.item;
	if (!item) {
		return null;
	}

	const enchant    = slot.enhancement;
	const minLevel   = item?.enhancement?.minLevel ?? 0;
	const maxLevel   = item?.enhancement?.maxLevel ?? 0;
	const minCaphras = enchant?.caphrasMinLevel;
	const maxCaphras = enchant?.caphrasMaxLevel ?? 0;

	const gradeColor = getGradeColor(item?.grade);


	return (
		<div className={"flex flex-col gap-4 border-t border-zinc-800 p-4"}>
			<div className={"flex flex-row items-center gap-3"}>
				<ItemIcon
					urn={item}
					grade={item.grade}
					imageClass={"w-8 h-8 shrink-0"}
					className={"flex-none"}
					clickable
				/>

				<div className={"flex flex-col min-w-0"}>
					<span className={"font-semibold truncate"} style={gradeColor ? {color : gradeColor.toString()} : undefined}>
						{item.name}
					</span>
					<span className={"text-xs text-zinc-400"}>{slot.info.Title}</span>
				</div>
				<div className={"flex flex-row gap-1 ml-auto"}>
					<Button
						variant={"outline"}
						size={"xs"}
						onClick={() => s.openPicker(slot.id)}
					>
						Change
					</Button>
					<Button
						variant={"ghost"}
						size={"xs"}
						onClick={() => s.unequip(slot.id)}
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
							{enchant?.name ?? "Base"} ({slot.enhanceLevel})
						</span>
					</div>
					<Slider
						value={slot.enhanceLevel}
						onValueChange={(value) => {
							applyUpgrade(value as number);
						}}
						min={minLevel}
						max={maxLevel}
						step={1}
					/>
				</div>
			)}

			{minCaphras > 0 && maxCaphras > 0 && (
				<div className={"flex flex-col gap-4 max-w-4/6"}>
					<div className="flex items-center gap-6">
						<Label>Caphras</Label>
						<span className="text-sm text-muted-foreground">
							Level {slot.caphrasLevel} / {maxCaphras}
						</span>
					</div>
					<Slider
						value={slot.caphrasLevel}
						onValueChange={(value) => {
							void s.upgrade(slot.id, undefined, value as number);
						}}
						min={minCaphras}
						max={maxCaphras}
						step={1}
					/>
				</div>
			)}

			<SlotStats itemId={item.id} level={slot.enhanceLevel} caphras={slot.caphrasLevel} />
		</div>
	);
}
