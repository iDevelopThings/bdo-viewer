import {IDockviewPanelProps} from "dockview-react";
import {ClassSelect} from "@/components/gear-builder/class-select.tsx";
import {GearRing, LifeRing} from "@/components/gear-builder/gear-ring.tsx";
import {GearSlotDetail} from "@/components/gear-builder/gear-slot-detail.tsx";
import {GearStatsPanel} from "@/components/gear-builder/gear-stats-panel.tsx";
import {GearTotals} from "@/components/gear-builder/gear-totals.tsx";
import {ItemPicker} from "@/components/gear-builder/item-picker.tsx";
import {cn} from "@/lib/utils.ts";
import {useGearBuilderStore, GearBuilderTabs} from "@/components/gear-builder/gear-builder-store.ts";
import {useEffect} from "react";
import {EnteredBuilder, ToggleMaxOnEquip} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {GearBuilderCharacterSettings} from "@/components/gear-builder/gear-builder-character-settings.tsx";


function GearBuilderInner() {
	const [builder, s] = useGearBuilderStore();

	if (builder.selectedClass == null) {
		return (
			<div className={"max-h-full overflow-auto"}>
				<ClassSelect />
			</div>
		);
	}


	return (
		<div className={"relative flex flex-row h-full max-h-full overflow-hidden"}>
			<div className={"flex flex-col flex-1 min-w-0 overflow-auto"}>
				<div className={"flex flex-row items-center gap-1 px-3 pt-2"}>
					{GearBuilderTabs.map(tab => (
						<button
							key={tab.id}
							className={cn(
								"px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
								builder.tab === tab.id
									? "bg-zinc-800 text-white"
									: "text-zinc-400 hover:bg-zinc-900 hover:text-white",
							)}
							onClick={() => {
								s.tab = tab.id;
							}}
						>
							{tab.label}
						</button>
					))}
					<div className={"ml-auto flex items-center gap-3"}>
						{builder.loading && <span className={"text-xs text-zinc-400"}>Loading...</span>}
						<button
							type={"button"}
							title={"Equip items at max enhancement + Caphras"}
							onClick={() => {
								s.selectedClass = null;
							}}
							className={cn(
								"flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border cursor-pointer transition-colors",
								"border-input text-zinc-400 hover:bg-zinc-900 hover:text-white",
							)}
						>
							Reset class
						</button>
						<button
							type={"button"}
							title={"Equip items at max enhancement + Caphras"}
							onClick={() => {
								s.maxOnEquip = !s.maxOnEquip;
								void ToggleMaxOnEquip();
							}}
							className={cn(
								"flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border cursor-pointer transition-colors",
								builder.maxOnEquip
									? "border-primary/60 bg-primary/15 text-primary"
									: "border-input text-zinc-400 hover:bg-zinc-900 hover:text-white",
							)}
						>
							<span className={cn(
								"h-2 w-2 rounded-full",
								builder.maxOnEquip ? "bg-primary" : "bg-zinc-600",
							)} />
							Max on equip
						</button>
					</div>
				</div>

				<div className={"flex flex-col items-center gap-2 p-4"}>
					{builder.tab === "combat" && (
						<>
							<GearRing />
							<GearTotals />
						</>
					)}
					{builder.tab === "life" && (
						<LifeRing />
					)}
					{builder.tab === "settings" && (
						<GearBuilderSettings />
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


	useEffect(() => {
		if (props.api.isActive) {
			void EnteredBuilder();
		}
		const disposeDidActiveChange = props.api.onDidActiveChange(event => {
			if (event.isActive) {
				void EnteredBuilder();
			}
		});

		return () => {
			disposeDidActiveChange.dispose();
		};
	}, []);

	return (
		<GearBuilderInner />
	);
}

export function GearBuilderSettings() {

	return (
		<div className={"self-start"}>
			<GearBuilderCharacterSettings />
		</div>
	);
}
