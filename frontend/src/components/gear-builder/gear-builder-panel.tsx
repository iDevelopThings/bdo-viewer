import type {DockviewApi, DockviewReadyEvent, IDockviewPanelHeaderProps, IDockviewPanelProps, SerializedDockview} from "dockview-react";
import {DockviewDefaultTab, DockviewReact} from "dockview-react";
import {ClassSelect} from "@/components/gear-builder/class-select.tsx";
import {GearRing, LifeRing} from "@/components/gear-builder/gear-ring.tsx";
import {GearSlotDetail} from "@/components/gear-builder/gear-slot-detail.tsx";
import {GearStatsPanel} from "@/components/gear-builder/gear-stats-panel.tsx";
import {GearTotals} from "@/components/gear-builder/gear-totals.tsx";
import {cn} from "@/lib/utils.ts";
import {gearBuilderStore, useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useEffect, useState} from "react";
import {EnteredBuilder} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {GearBuilderCharacterSettings} from "@/components/gear-builder/gear-builder-character-settings.tsx";
import {Button} from "@/components/ui/button.tsx";
import {useSnapshot} from "valtio/react";
import {subscribe} from "valtio";
import {ConsumablesRow} from "@/components/gear-builder/gear-builder-consumables.tsx";
import {GearBuilderCrystals} from "@/components/gear-builder/gear-builder-crystals.tsx";
import {GearHistory} from "@/components/gear-builder/gear-history.tsx";
import {useDisposableEventListener} from "@/utils.tsx";

const GEAR_LAYOUT_KEY = "bdo-gear-layout";

// Dockview applies its theme's className to the *shell* (which wraps the edge groups), defaulting
// to themeAbyss when no theme is passed — that's why edge groups (Stats/Slot Details) rendered in
// abyss's blue while the main grid picked up our className. Naming our theme here puts the shadcn
// vars on the shell too, so edge groups match. className carries bdo-layout for the shared surfaces.
const GEAR_THEME = {
	name              : "shadcn",
	className         : "dockview-theme-shadcn bdo-layout",
	colorScheme       : "dark",
	tabGroupIndicator : "none",
} as const;

// The center tab group. Stats/Slot Details live in their own edge groups (see buildDefault).
function EquipmentTab() {
	const {selectedClass} = useSnapshot(gearBuilderStore);

	return (
		<div className={"relative flex h-full flex-col overflow-y-scroll "}>
			<div className={"relative flex flex-row grow p-8"}>
				<div className={"flex flex-col items-center grow"}>
					<GearRing />
					<GearTotals />
				</div>
			</div>

			<div className={"pointer-events-none absolute top-2 left-4 z-0 select-none text-4xl font-black uppercase tracking-widest text-fg/10"}>
				{selectedClass?.Title}
			</div>

			<div className={"absolute bottom-2 right-2 z-10 flex flex-row items-end gap-2"}>
				<GearHistory />
				<ConsumablesRow />
			</div>
		</div>
	);
}

function LifeTab() {
	return (
		<div className={"flex h-full flex-col items-center gap-2 overflow-auto p-4"}>
			<LifeRing />
			<GearTotals />
		</div>
	);
}

function SettingsTab() {
	return (
		<div className={"h-full overflow-auto p-4"}>
			<GearBuilderCharacterSettings />
		</div>
	);
}

function CrystalsTab() {
	return <GearBuilderCrystals />;
}

function StatsTab() {
	return <GearStatsPanel />;
}


// Slot Details lives in a persistent bottom edge group, so it needs a placeholder for the
// (common) empty state instead of GearSlotDetail's bare `return null`.
function SlotDetailTab() {
	const {selectedSlot} = useSnapshot(gearBuilderStore);

	if (!selectedSlot?.item) {
		return (
			<div className={"flex h-full items-center justify-center p-4 text-sm text-fg-subtle"}>
				Select a slot to view its details
			</div>
		);
	}

	return (
		<div className={"h-full overflow-auto"}>
			<GearSlotDetail />
		</div>
	);
}

const components = {
	combat     : EquipmentTab,
	life       : LifeTab,
	crystals   : CrystalsTab,
	settings   : SettingsTab,
	stats      : StatsTab,
	slotDetail : SlotDetailTab,
};

// The center tabs are fixed chrome — hide the close button so they can't be removed
// (there's no UI to bring them back).
const GearTab = (props: IDockviewPanelHeaderProps) => <DockviewDefaultTab hideClose {...props} />;

function buildDefault(api: DockviewApi) {
	api.addPanel({id : "combat", component : "combat", title : "Equipment"});
	api.addPanel({
		id        : "life",
		component : "life",
		title     : "Life Tools",
		position  : {referencePanel : "combat", direction : "within"},
	});
	api.addPanel({
		id        : "crystals",
		component : "crystals",
		title     : "Crystals",
		position  : {referencePanel : "combat", direction : "within"},
	});
	api.addPanel({
		id        : "settings",
		component : "settings",
		title     : "Settings",
		position  : {referencePanel : "combat", direction : "within"},
	});

	api.addEdgeGroup("right", {id : "stats-edge", initialSize : 300, minimumSize : 180, maximumSize : 560});
	api.addPanel({id : "stats", component : "stats", title : "Stats", position : {referenceGroup : "stats-edge"}});

	// Collapsed by default: an unselected slot has nothing to show, so it sits as a slim title
	// bar until a slot is picked (see the auto-expand effect below).
	api.addEdgeGroup("bottom", {id : "detail-edge", initialSize : 340, minimumSize : 140, collapsed : true, collapsedSize : 34});
	api.addPanel({id : "slotDetail", component : "slotDetail", title : "Slot Details", position : {referenceGroup : "detail-edge"}});

	api.getPanel("combat")?.api.setActive();
}

function GearBuilderInner() {
	const {loading, selectedClass, maxOnEquip} = useSnapshot(gearBuilderStore);

	const [api, setApi] = useState<DockviewApi>();

	const onReady = (event: DockviewReadyEvent) => {
		setApi(event.api);

		const serialized = localStorage.getItem(GEAR_LAYOUT_KEY);
		if (serialized) {
			try {
				event.api.fromJSON(JSON.parse(serialized) as SerializedDockview, {reuseExistingPanels : true});
				// Older saved layouts predate the Crystals tab — add it beside Life if missing.
				if (!event.api.getPanel("crystals")) {
					event.api.addPanel({
						id        : "crystals",
						component : "crystals",
						title     : "Crystals",
						position  : {referencePanel : "life", direction : "within"},
					});
				}
				return;
			} catch (err) {
				console.error("Failed to load gear layout from localStorage", err);
			}
		}
		buildDefault(event.api);
	};

	useDisposableEventListener(api, "onDidLayoutChange", () => {
		if (!api) {
			return;
		}
		localStorage.setItem(GEAR_LAYOUT_KEY, JSON.stringify(api.toJSON()));
	});

	// Slide the Slot Details edge group open when a slot with an item becomes selected; leave
	// collapsing to the user so it doesn't fight them while they browse slots.
	useEffect(() => {
		if (!api) {
			return;
		}
		return subscribe(gearBuilderStore, () => {
			const edge = api.getEdgeGroup("bottom");
			if (edge && gearBuilderStore.selectedSlot?.item && edge.isCollapsed()) {
				edge.expand();
			}
		});
	}, [api]);

	if (loading) {
		return (
			<div className={"flex h-full w-full items-center justify-center"}>
				<span className={"text-sm text-fg-subtle"}>Loading...</span>
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
		<div className={"relative flex h-full max-h-full flex-col overflow-hidden"}>
			<div className={"flex flex-row items-center justify-end gap-3 border-b border-surface-border px-3 py-2"}>
				<Button variant={"chip"} size={"xs"} onClick={() => gearBuilderStore.clearClass()}>
					Change class
				</Button>
				<Button
					variant={"chip"}
					size={"xs"}
					aria-pressed={maxOnEquip}
					onClick={() => gearBuilderStore.toggleMaxOnEquip()}
				>
					<span className={cn("h-2 w-2 rounded-full", maxOnEquip ? "bg-primary" : "bg-surface-3")} />
					Max on equip
				</Button>
			</div>

			<div className={"relative flex-1 min-h-0"}>
				<DockviewReact
					theme={GEAR_THEME}
					onReady={onReady}
					scrollbars={"native"}
					components={components}
					defaultTabComponent={GearTab}
					defaultRenderer={"onlyWhenVisible"}
				/>
			</div>
		</div>
	);
}

export function GearBuilderPanel(props: IDockviewPanelProps) {
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
