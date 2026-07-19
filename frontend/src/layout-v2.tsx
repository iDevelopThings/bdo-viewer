import {DockviewApi, DockviewDefaultTab, DockviewReact, DockviewReadyEvent, IDockviewPanelHeaderProps, SerializedDockview} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import {useEffect, useRef, useState} from "react";
import {GripHorizontal} from "lucide-react";
import {setDockviewApi} from "@/state/panels.ts";
import {setLayoutMode} from "@/state/layout-mode.ts";
import {TreeNav} from "@/components/sidebar/tree-nav.tsx";
import {SourceList} from "@/components/source-list/source-list.tsx";
import {DetailsPanel} from "@/components/details/details-panel.tsx";
import {GearBuilderPanel} from "@/components/gear-builder/gear-builder-panel.tsx";
import {SettingsPanel} from "@/components/settings/settings-panel.tsx";
import {CraftCalculatorPanel} from "@/components/calc/craft-calculator-panel.tsx";
import {CompareItemsPanel} from "@/components/compare/compare-items-panel.tsx";
import {WorldMapPanel} from "@/components/world-map/world-map-panel.tsx";
import {ToolRail} from "@/components/rail/tool-rail.tsx";

const LAYOUT_KEY = "layout-v2";

// Leaf panels drag from a slim grip instead of a labelled tab; content panels keep the
// normal closable tab since several stack in the same group.
const LEAF_PANELS = new Set(["tree", "list"]);

const components = {
	tree         : TreeNav,
	list         : SourceList,
	itemDetails  : DetailsPanel,
	gearBuilder  : GearBuilderPanel,
	settings     : SettingsPanel,
	craftCalc    : CraftCalculatorPanel,
	compareItems : CompareItemsPanel,
	worldMap     : WorldMapPanel,
};

const GripTab = (props: IDockviewPanelHeaderProps) => {
	if (LEAF_PANELS.has(props.api.id)) {
		return (
			<div
				className={"flex items-center justify-center w-full h-full cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 transition-colors"}
				title={`Drag to rearrange · ${props.api.title}`}
			>
				<GripHorizontal className={"size-4"} />
			</div>
		);
	}
	return <DockviewDefaultTab {...props} />;
};

function buildDefault(api: DockviewApi) {
	const mainGroup   = api.addGroup({id : "main", direction : "above"});
	const centerGroup = api.addGroup({id : "center", direction : "right", referenceGroup : mainGroup.id});
	const rightGroup  = api.addGroup({id : "right", direction : "right", referenceGroup : centerGroup.id});

	const treePanel = api.addPanel({
		id           : "tree",
		component    : "tree",
		title        : "Navigation",
		initialWidth : 260,
		minimumWidth : 200,
		maximumWidth : 420,
		position     : {referenceGroup : mainGroup},
	});
	api.addPanel({
		id        : "list",
		component : "list",
		title     : "List",
		position  : {referenceGroup : centerGroup, direction : "within"},
	});
	api.addPanel({
		id        : "preview",
		component : "itemDetails",
		title     : "Preview",
		position  : {referenceGroup : rightGroup.id, direction : "within"},
	});

	treePanel.api.setSize({width : 260});
}

export function AppLayoutV2() {

	const [api, setApi] = useState<DockviewApi>();
	const lastTreeWidth = useRef<number>(260);
	const [treeVisible, setTreeVisible] = useState(true);

	function tryLoadLayout(api: DockviewApi): boolean {
		const serialized = localStorage.getItem(LAYOUT_KEY);
		if (!serialized) {
			return false;
		}
		try {
			api.fromJSON(JSON.parse(serialized), {reuseExistingPanels : true});
			return true;
		} catch (err) {
			console.error("Failed to load v2 layout from localStorage", err);
			return false;
		}
	}

	const onReady = (event: DockviewReadyEvent) => {
		setApi(event.api);
		setDockviewApi(event.api);

		if (!tryLoadLayout(event.api)) {
			buildDefault(event.api);
		}

		setTreeVisible(!!event.api.getPanel("tree"));
	};

	// Collapse reclaims the tree's width for list + detail; the tree's own state
	// (expanded/active) lives in the navigation store, so removing the panel loses nothing.
	function toggleTree() {
		if (!api) {
			return;
		}

		const existing = api.getPanel("tree");
		if (existing) {
			lastTreeWidth.current = existing.api.width || lastTreeWidth.current;
			api.removePanel(existing);
			setTreeVisible(false);
			return;
		}

		const listPanel = api.getPanel("list");
		const panel     = api.addPanel({
			id        : "tree",
			component : "tree",
			title     : "Navigation",
			position  : listPanel
				? {referencePanel : listPanel.id, direction : "left"}
				: undefined,
		});
		panel.api.setSize({width : lastTreeWidth.current});
		setTreeVisible(true);
	}

	useEffect(() => {
		if (!api) {
			return;
		}

		const disposable = api.onDidLayoutChange(() => {
			const layout: SerializedDockview = api.toJSON();
			localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
		});

		return () => {
			disposable.dispose();
			setDockviewApi(undefined);
		};
	}, [api]);

	return (
		<div className={"flex flex-row h-full w-full min-h-0"}>
			<ToolRail
				treeVisible={treeVisible}
				onToggleTree={toggleTree}
				onExit={() => setLayoutMode("v1")}
			/>
			<div className={"flex-1 min-w-0 h-full"}>
				<DockviewReact
					className={"dockview-theme-shadcn bdo-layout-v2"}
					onReady={onReady}
					scrollbars={"native"}
					components={components}
					defaultTabComponent={GripTab}
				/>
			</div>
		</div>
	);
}
