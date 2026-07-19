import type {ReactNode} from "react";
import {Calculator, GitCompare, LayoutTemplate, Map, PanelLeftClose, PanelLeftOpen, Settings, Swords} from "lucide-react";
import {openCompareItemsPanel, openCraftCalculatorPanel, openGearBuilderPanel, openMapPanel, openSettingsPanel} from "@/state/panels.ts";
import {cn} from "@/lib/utils.ts";

type RailButtonProps = {
	icon: ReactNode;
	label: string;
	onClick: () => void;
}

function RailButton({icon, label, onClick}: RailButtonProps) {
	return (
		<button
			type={"button"}
			title={label}
			aria-label={label}
			onClick={onClick}
			className={cn(
				"flex items-center justify-center size-9 rounded text-zinc-400 shrink-0",
				"hover:bg-zinc-800 hover:text-zinc-100 transition-colors",
			)}
		>
			{icon}
		</button>
	);
}

type ToolRailProps = {
	treeVisible: boolean;
	onToggleTree: () => void;
	onExit: () => void;
}

// Persistent app chrome, rendered outside the dockview container so it never
// participates in the docking grid. Holds the tool shortcuts that used to sit atop the
// sidebar (and duplicate the tab strip), plus the nav-tree visibility toggle.
export function ToolRail({treeVisible, onToggleTree, onExit}: ToolRailProps) {
	return (
		<div className={"flex flex-col items-center gap-1 py-2 px-1.5 bg-surface-2 border-r border-surface-border shrink-0"} data-testid={"tool-rail"}>
			<RailButton icon={<Swords className={"size-5"} />} label={"Gear Builder"} onClick={() => openGearBuilderPanel()} />
			<RailButton icon={<Calculator className={"size-5"} />} label={"Crafting Calculator"} onClick={() => openCraftCalculatorPanel()} />
			<RailButton icon={<GitCompare className={"size-5"} />} label={"Compare Items"} onClick={() => openCompareItemsPanel()} />
			<RailButton icon={<Map className={"size-5"} />} label={"World Map"} onClick={() => openMapPanel()} />

			<div className={"flex-1"} />

			<RailButton
				icon={treeVisible ? <PanelLeftClose className={"size-5"} /> : <PanelLeftOpen className={"size-5"} />}
				label={treeVisible ? "Hide navigation" : "Show navigation"}
				onClick={onToggleTree}
			/>
			<div className={"w-6 h-px bg-surface-border my-1"} />
			<RailButton icon={<Settings className={"size-5"} />} label={"Settings"} onClick={() => openSettingsPanel()} />
			<RailButton icon={<LayoutTemplate className={"size-5"} />} label={"Classic layout (Ctrl+Alt+L)"} onClick={onExit} />
		</div>
	);
}
