import {IDockviewPanelProps} from "dockview-react";
import {ClassSelect} from "@/components/gear-builder/class-select.tsx";
import {GearRing, LifeRing} from "@/components/gear-builder/gear-ring.tsx";
import {GearSlotDetail} from "@/components/gear-builder/gear-slot-detail.tsx";
import {GearStatsPanel} from "@/components/gear-builder/gear-stats-panel.tsx";
import {GearTotals} from "@/components/gear-builder/gear-totals.tsx";
import {ItemPicker} from "@/components/gear-builder/item-picker.tsx";
import {cn} from "@/lib/utils.ts";
import {GearBuilderTabs, gearBuilderStore, gearBuilderPersistent, useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useEffect, useCallback} from "react";
import {EnteredBuilder} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {GearBuilderCharacterSettings} from "@/components/gear-builder/gear-builder-character-settings.tsx";
import {Tabs, TabsContent, TabsList, TabsTrigger,} from "@/components/ui/tabs";
import {Button} from "@/components/ui/button.tsx";
import {useSnapshot} from "valtio/react";
import {ConsumablesRow} from "@/components/gear-builder/gear-builder-consumables.tsx";
import {GearHistory} from "@/components/gear-builder/gear-history.tsx";

function GearBuilderInner() {
	const {loading, selectedClass, maxOnEquip} = useSnapshot(gearBuilderStore);
	const {tab}                                = useSnapshot(gearBuilderPersistent);

	const updateSavedTab = useCallback((t: typeof GearBuilderTabs[number]["id"]) => {
		gearBuilderPersistent.tab = t;
	}, []);

	if (loading) {
		return (
			<div className={"flex h-full w-full items-center justify-center"}>
				<span className={"text-sm text-zinc-400"}>Loading...</span>
			</div>
		);
	}

	if (selectedClass == null) {
		return (
			<div className={"max-h-full overflow-auto"}>
				<ClassSelect />
			</div>
		);
	}

	return (
		<div className={"relative flex flex-row h-full max-h-full overflow-hidden"}>
			<div className={"flex flex-col flex-1 min-w-0 overflow-auto"}>

				<Tabs
					defaultValue={tab}
					onValueChange={updateSavedTab}
					value={tab}
					className={"flex-1"}
				>
					<div className={"flex flex-row items-center justify-between gap-1 px-3 pt-2"}>
						<TabsList variant={"floating"} className={"flex flex-row gap-2"}>
							{GearBuilderTabs.map(tab => (
								<TabsTrigger key={tab.id} value={tab.id}>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>

						<div className={"ml-auto flex items-center gap-3"}>

							<Button variant={"chip"} size={"xs"} onClick={() => gearBuilderStore.clearClass()}>
								Change class
							</Button>
							<Button
								variant={"chip"}
								size={"xs"}
								aria-pressed={maxOnEquip}
								onClick={() => gearBuilderStore.toggleMaxOnEquip()}
							>
								<span className={cn("h-2 w-2 rounded-full", maxOnEquip ? "bg-primary" : "bg-zinc-600")} />
								Max on equip
							</Button>

						</div>
					</div>

					<TabsContent value="combat" className={"flex flex-col min-h-0"}>

						<div className={"relative flex flex-row gap-2 p-4 grow min-h-0"}>
							{/* Faint class watermark in the corner, à la Unreal's "BLUEPRINT" tag. */}
							<div className={"pointer-events-none absolute top-2 left-4 z-0 select-none text-4xl font-black uppercase tracking-widest text-fg/10"}>
								{selectedClass?.Title}
							</div>
							<div className={"flex flex-row items-end"}>
								<ConsumablesRow />
							</div>
							<div className={"flex flex-col items-center gap-2 grow min-h-0"}>
								<GearRing />
								<GearTotals />
							</div>

							<div className={"absolute bottom-4 right-4 z-10 flex flex-row items-center gap-2"}>
								<GearHistory />
							</div>
						</div>


					</TabsContent>

					<TabsContent value="life">
						<div className={"flex flex-col items-center gap-2 p-4"}>
							<LifeRing />
							<GearTotals />
						</div>

					</TabsContent>

					<TabsContent value="settings">
						<div className={"flex flex-col items-center gap-2 p-4"}>
							<GearBuilderSettings />
						</div>
					</TabsContent>
				</Tabs>

				<GearSlotDetail />

			</div>

			<GearStatsPanel />

			<ItemPicker />
		</div>
	);
}

export function GearBuilderPanel(props: IDockviewPanelProps) {
	// const params  = props.params as { key?: string | number } | undefined;
	// const buildId = params?.key !== undefined ? String(params.key) : "default";

	// Triggers initial mount if we haven't already
	const [,] = useGearBuilderStore();

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
	}, [props.api]);

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
