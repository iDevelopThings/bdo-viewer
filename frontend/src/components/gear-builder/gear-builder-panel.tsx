import {IDockviewPanelProps} from "dockview-react";
import {type GearGroupId} from "@/state/gear/gear-slots.ts";
import {GearBuildProvider, useGearBuild} from "@/state/gear/gear.tsx";
import {ClassSelect} from "@/components/gear-builder/class-select.tsx";
import {GearRing, LifeRing} from "@/components/gear-builder/gear-ring.tsx";
import {GearSlotDetail} from "@/components/gear-builder/gear-slot-detail.tsx";
import {GearStatsPanel} from "@/components/gear-builder/gear-stats-panel.tsx";
import {GearTotals} from "@/components/gear-builder/gear-totals.tsx";
import {ItemPicker} from "@/components/gear-builder/item-picker.tsx";
import {cn} from "@/lib/utils.ts";

// Appearance/costume slots live on the equipment view's inner ring and bottom
// bar, so there are only two tabs.
const TABS: { id: GearGroupId, label: string }[] = [
	{id : "combat", label : "Equipment"},
	{id : "life", label : "Life Tools"},
];

function GearBuilderInner() {
	const [store, snap] = useGearBuild();

	if (!snap.characterClass) {
		return (
			<div className={"max-h-full overflow-auto"}>
				<ClassSelect />
			</div>
		);
	}

	const activeTab: GearGroupId = snap.activeGroup === "life" ? "life" : "combat";

	return (
		<div className={"relative flex flex-row h-full max-h-full overflow-hidden"}>
			<div className={"flex flex-col flex-1 min-w-0 overflow-auto"}>
				<div className={"flex flex-row items-center gap-1 px-3 pt-2"}>
					{TABS.map(tab => (
						<button
							key={tab.id}
							className={cn(
								"px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
								activeTab === tab.id
									? "bg-zinc-800 text-white"
									: "text-zinc-400 hover:bg-zinc-900 hover:text-white",
							)}
							onClick={() => {
								store.activeGroup = tab.id;
							}}
						>
							{tab.label}
						</button>
					))}
					<div className={"ml-auto flex items-center gap-3"}>
						{snap.loading && <span className={"text-xs text-zinc-400"}>Loading...</span>}
						<button
							type={"button"}
							title={"Equip items at max enhancement + Caphras"}
							onClick={() => {
								store.maxOnEquip = !store.maxOnEquip;
							}}
							className={cn(
								"flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border cursor-pointer transition-colors",
								snap.maxOnEquip
									? "border-primary/60 bg-primary/15 text-primary"
									: "border-input text-zinc-400 hover:bg-zinc-900 hover:text-white",
							)}
						>
							<span className={cn(
								"h-2 w-2 rounded-full",
								snap.maxOnEquip ? "bg-primary" : "bg-zinc-600",
							)} />
							Max on equip
						</button>
					</div>
				</div>

				<div className={"flex flex-col items-center gap-2 p-4"}>
					{activeTab === "combat" ? (
						<>
							<GearRing />
							<GearTotals />
						</>
					) : (
						<LifeRing />
					)}
				</div>

				<GearSlotDetail />
			</div>

			<GearStatsPanel />

			<ItemPicker />
		</div>
	);
}

export function GearBuilderPanel(props: IDockviewPanelProps) {
	const params  = props.params as { key?: string | number } | undefined;
	const buildId = params?.key !== undefined ? String(params.key) : "default";

	return (
		<GearBuildProvider buildId={buildId}>
			<GearBuilderInner />
		</GearBuildProvider>
	);
}
