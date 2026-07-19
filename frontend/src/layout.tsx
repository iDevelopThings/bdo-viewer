import {DockviewApi, DockviewDefaultTab, DockviewReact, DockviewReadyEvent, IDockviewPanelHeaderProps, IDockviewPanelProps, SerializedDockview} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import {useEffect, useState} from "react";
import {setDockviewApi} from "@/state/panels.ts";
import {Sidebar} from "@/components/sidebar/sidebar.tsx";
import {SourceList} from "@/components/source-list/source-list.tsx";
import {DetailsPanel} from "@/components/details/details-panel.tsx";
import {GearBuilderPanel} from "@/components/gear-builder/gear-builder-panel.tsx";
import {SettingsPanel} from "@/components/settings/settings-panel.tsx";
import {CraftCalculatorPanel} from "@/components/calc/craft-calculator-panel.tsx";
import {CompareItemsPanel} from "@/components/compare/compare-items-panel.tsx";
import {WorldMapPanel} from "@/components/world-map/world-map-panel.tsx";


const MyPanel = (props: IDockviewPanelProps) => {
	return <div style={{padding : 16}}>{props.api.title}</div>;
};


const NoCloseTab = (props: IDockviewPanelHeaderProps) => {
	let closable = true; // props.api.id.includes("item:") || props.api.id.includes("gear:");

	switch (props.api.id) {
		case "sidebar":
		case "list":
			closable = false;
			break;
		default:
			break;
	}

	return <DockviewDefaultTab {...props} hideClose={!closable} />;
};

const components = {
	default      : MyPanel,
	sidebar      : Sidebar,
	list         : SourceList,
	itemDetails  : DetailsPanel,
	gearBuilder  : GearBuilderPanel,
	settings     : SettingsPanel,
	craftCalc    : CraftCalculatorPanel,
	compareItems : CompareItemsPanel,
	worldMap     : WorldMapPanel,
};

/*const RightActions = (props: IDockviewHeaderActionsProps) => {
	if (props.location?.type !== "edge") {
		return null;
	}

	const [collapsed, setCollapsed] = useState(props.api.isCollapsed());

	useEffect(() => {
		const disposable = props.api.onDidCollapsedChange((event) => {
			setCollapsed(event.isCollapsed);
		});
		return () => disposable.dispose();
	}, [props.api]);

	return (
		<button
			style={{
				cursor     : "pointer",
				background : "none",
				border     : "none",
				color      : "inherit",
				padding    : "0 4px",
			}}
			onClick={() =>
				collapsed ? props.api.expand() : props.api.collapse()
			}
		>
			{collapsed ? "+" : "-"}
		</button>
	);
};*/

export function AppLayout() {

	const [api, setApi] = useState<DockviewApi>();

	const useLayoutPersistence = true;

	function tryLoadLayout(api: DockviewApi) {
		if (!useLayoutPersistence)
			return false;

		const serializedLayout = localStorage.getItem("layout");

		if (serializedLayout) {
			try {
				api.fromJSON(JSON.parse(serializedLayout), {reuseExistingPanels : true});

				return true;
			} catch (err) {
				console.error("Failed to load layout from localStorage", err);
			}
		}

		return false;
	}

	const onReady = (event: DockviewReadyEvent) => {
		setApi(event.api);
		setDockviewApi(event.api);

		if (!tryLoadLayout(event.api)) {
			const mainGroup   = event.api.addGroup({
				id        : "main",
				direction : "above",
			});
			const centerGroup = event.api.addGroup({
				id             : "center",
				direction      : "right",
				referenceGroup : mainGroup.id,
			});
			const rightGroup  = event.api.addGroup({
				id             : "right",
				direction      : "right",
				referenceGroup : centerGroup.id,
			});

			const sidebarPanel = event.api.addPanel({
				id           : "sidebar",
				component    : "sidebar",
				title        : "Sidebar",
				initialWidth : 350,
				minimumWidth : 250,
				maximumWidth : 400,
				position     : {referenceGroup : mainGroup}
			});
			event.api.addPanel({
				id        : "list",
				component : "list",
				title     : "List",
				position  : {
					referenceGroup : centerGroup,
					direction      : "within"
				}
			});

			event.api.addPanel({
				id        : "preview",
				component : "itemDetails",
				title     : "Preview",
				position  : {
					referenceGroup : rightGroup.id,
					direction      : "within"
				}
			});


			sidebarPanel.api.setSize({
				height : window.innerHeight,
				width  : 300
			});


		}

	};


	useEffect(() => {
		if (!api) {
			return;
		}

		const disposable = api.onDidLayoutChange(() => {
			const layout: SerializedDockview = api.toJSON();
			localStorage.setItem("layout", JSON.stringify(layout));
		});

		return () => {
			disposable.dispose();
			setDockviewApi(undefined);
		};
	}, [api]);


	return (
		<DockviewReact
			className="dockview-theme-shadcn"
			onReady={onReady}
			scrollbars={"native"}
			components={components}
			defaultTabComponent={NoCloseTab}
		/>
	);
}
