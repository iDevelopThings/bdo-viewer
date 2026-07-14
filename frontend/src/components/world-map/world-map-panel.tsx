import {IDockviewPanelProps} from "dockview-react";
import {useSnapshot} from "valtio";
import {GameMap} from "./game-map";
import {mapState} from "@/components/world-map/map-state.ts";
import {useEffect} from "react";
import {MapSettingsPanel} from "@/components/world-map/map-settings-panel.tsx";
import {NodeInfoPanel} from "@/components/world-map/node-info-panel.tsx";

export function WorldMapPanel(_props: IDockviewPanelProps) {
	const map = useSnapshot(mapState);

	useEffect(() => {
		void mapState.ensureLoaded();
	}, []);

	if (map.loading) {
		return (
			<div className={"w-full h-full flex items-center justify-center"}>
				<p className={"text-zinc-400 text-sm"}>Loading map data...</p>
			</div>
		);
	}

	return (
		<div
			style={{fontFamily : "system-ui, sans-serif",}}
			className={"relative inset-0 overflow-hidden w-full h-full"}
		>
			<GameMap />

			<NodeInfoPanel />

			<MapSettingsPanel />
		</div>
	);
}
