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
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {getGradeColor} from "@/lib/types/item-grades.ts";
import {useDebounce} from "@/utils.tsx";
import {useSnapshot} from "valtio/react";


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
	const {selectedSlot : slot} = useSnapshot(gearBuilderStore);

	// Hold the enhance level locally while dragging so the slider stays smooth without a store write
	// (and full re-render + stat re-fetch) on every tick — commit to the backend debounced instead.
	const [dragEnhanceLevel, setDragEnhanceLevel]           = useState<number | null>(null);
	const [dragCaphrasLevel, setDragCaphrasLevel]             = useState<number | null>(null);

	const [committedEnhanceLevel, setCommittedEnhanceLevel] = useState(slot?.enhanceLevel);
	const [committedCaphrasLevel, setCommittedCaphrasLevel] = useState(slot?.caphrasLevel);

	const commitEnhance = useDebounce((l: number) => {
		void gearBuilderStore.upgrade(gearBuilderStore.selectedSlot.id, l);
	}, 5);
	const commitCaphras = useDebounce((l: number) => {
		void gearBuilderStore.upgrade(gearBuilderStore.selectedSlot.id, undefined, l);
	}, 5);

	// Drop the local override whenever the store's committed level changes: our debounced commit
	// landing, an external change (e.g. max-on-equip), or a different slot being selected.
	if (slot?.enhanceLevel !== committedEnhanceLevel ) {
		setCommittedEnhanceLevel(slot?.enhanceLevel);
		setDragEnhanceLevel(null);
	}
	if (slot?.caphrasLevel !== committedCaphrasLevel) {
		setCommittedCaphrasLevel(slot?.caphrasLevel);
		setDragCaphrasLevel(null);
	}

	if (!slot) {
		return null;
	}

	const item = slot.item;
	if (!item) {
		return null;
	}

	const enhanceLevel = dragEnhanceLevel ?? slot.enhanceLevel;
	const caphrasLevel = dragCaphrasLevel ?? slot.caphrasLevel;
	const minLevel     = slot?.enhancementMinLevel ?? 0;
	const maxLevel     = slot?.enhancementMaxLevel ?? 0;
	const minCaphras   = slot?.caphrasMinLevel;
	const maxCaphras   = slot?.caphrasMaxLevel ?? 0;

	const gradeColor = getGradeColor(item?.extra?.grade);


	return (
		<div className={"flex flex-col gap-4 border-t border-surface-border p-4"}>
			<div className={"flex flex-row items-center gap-3"}>
				<ItemIcon
					urn={{id : item.urn, name : item.title}}
					grade={item.extra?.grade}
					imageClass={"w-8 h-8 shrink-0"}
					className={"flex-none"}
					clickable
				/>

				<div className={"flex flex-col min-w-0"}>
					<span className={"font-semibold truncate"} style={gradeColor ? {color : gradeColor.toString()} : undefined}>
						{item.title}
					</span>
					<span className={"text-xs text-fg-subtle"}>{slot.info.Title}</span>
				</div>
				<div className={"flex flex-row gap-1 ml-auto"}>
					<Button
						variant={"outline"}
						size={"xs"}
						onClick={() => gearBuilderStore.openPicker(slot.id)}
					>
						Change
					</Button>
					<Button
						variant={"ghost"}
						size={"xs"}
						onClick={() => gearBuilderStore.unequip(slot.id)}
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
							{slot.enhancementTitle ?? "Base"} ({enhanceLevel})
						</span>
					</div>
					<Slider
						value={enhanceLevel}
						onValueChange={(value) => {
							setDragEnhanceLevel(value as number);
							commitEnhance(value as number);
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
						value={caphrasLevel}
						onValueChange={(value) => {
							setDragCaphrasLevel(value as number);
							commitCaphras(value as number);
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
