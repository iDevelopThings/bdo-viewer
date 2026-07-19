import {MutableRefObject, useCallback, useEffect, useMemo, useRef, useState} from "react";
import DeckGL from "@deck.gl/react";
import {OrthographicView, type PickingInfo, ViewStateChangeParameters, OrthographicViewState, LinearInterpolator} from "@deck.gl/core";
import {TileLayer} from "@deck.gl/geo-layers";
import {BitmapLayer, LineLayer, TextLayer, IconLayer, ScatterplotLayer, PolygonLayer} from "@deck.gl/layers";
import {useSnapshot} from "valtio";
import {tileURL, tileWorldBounds, worldExtent, type WorldMeta, WORLD_LAYER, INITIAL_TARGET, INITIAL_ZOOM, MIN_ZOOM, MAX_ZOOM, MAP_WORLD_BASE_Z, FOCUS_TRANSITION_MS,} from "./map-config";
import {mapState} from "@/components/world-map/map-state.ts";
import type {MapLinkSegment, NpcMarker, RegionBound, RegionPoint} from "./types";
import {WrappedWorldNode} from "@/components/world-map/world-node.ts";
import {nodeTooltip, npcTooltip} from "@/components/world-map/node-tooltip.ts";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {openSourceDetails} from "@/state/panels.ts";
import {MaybeReadonly} from "@/types.ts";
import {cn} from "@/lib/utils.ts";
import {PlusIcon, MinusIcon} from "lucide-react";

const NODE_LAYER_IDS   = ["node-icons", "node-dots", "sub-node-icons"];
const NPC_LAYER_ID     = "npc-markers";
const ALL_NPC_LAYER_ID = "npc-all-markers";
const NPC_ICON_URL     = "/nodes/npc.png";
/** public/nodes/npc.png is 26x26. */
const NPC_ICON_PX      = 26;

const LABEL_SIZE_PX = 13;

// fontSize is the atlas rasterization size, not the drawn size: deck samples it without mipmaps,
// so an atlas far larger than LABEL_SIZE_PX stair-steps. smoothing is the shader's edge gamma.
const FONT_SETTINGS                                   = {
	sdf       : true,
	fontSize  : 32,
	buffer    : 8,
	radius    : 8,
	cutoff    : 0.25,
	smoothing : 0.2,
};
const FONT_FAMILY                                     = "'Segoe UI', system-ui, -apple-system, sans-serif";
// Deck divides outlineWidth by fontSettings.radius; the outline needs sdf to render at all.
const OUTLINE_WIDTH                                   = 2;
const OUTLINE_COLOR: [number, number, number, number] = [9, 12, 17, 255];
// Deck's default character set is ASCII 32-128, which drops the accented node names (Grándiha).
const CHARACTER_SET                                   = "auto" as const;


// worldTileLayer builds a single-level TileLayer at pyramid level z. minZoom==maxZoom pins
// deck to that level (its own non-geo z heuristic misjudges this huge-tileSize setup);
// maxCacheSize keeps panned-past tiles resident so they don't re-fetch and pop.
function worldTileLayer(m: MaybeReadonly<WorldMeta>, z: number, id: string) {
	return new TileLayer({
		id,
		tileSize     : m.tileWorldSizeZ0,
		minZoom      : z,
		maxZoom      : z,
		extent       : worldExtent(m),
		maxRequests  : 16,
		maxCacheSize : 512,
		// Keep already-loaded coarser/finer tiles visible to fill gaps until the target level
		// loads, so a zoom-level change cross-fades instead of reloading from blank. (Only
		// affordable now that the view is uncontrolled — it isn't reprocessed every frame.)
		refinementStrategy : "best-available",
		getTileData        : (tile) => tile.index,
		renderSubLayers    : (props) => {
			const {x, y, z : tz}             = props.tile.index;
			const {left, right, bottom, top} = tileWorldBounds(m, tz, x, y);
			return new BitmapLayer({
				id               : `${props.id}-bmp`,
				image            : tileURL(WORLD_LAYER, tz, x, y),
				bounds           : [left, bottom, right, top],
				coordinateSystem : "cartesian",
			});
		},
	});
}

interface OrthoViewState {
	target: [number, number, number];
	zoom: number;
	minZoom: number;
	maxZoom: number;
	transitionDuration?: number;
	transitionInterpolator?: LinearInterpolator;
}

function MetricKv({title, value}: { title: string; value: any }) {
	return (
		<div className="flex justify-between text-xs text-zinc-400">
			<span>{title}</span>
			<span className="text-zinc-200">{typeof value === "number" && value > 0 ? value.toFixed(2) : String(value)}</span>
		</div>
	);
}

/** Polls what has to hold for the map to be interactive, for the debug overlay — a map that
 *  renders but ignores input has one of these false. */
function useDeckHealth(deckRef: MutableRefObject<any>, enabled: boolean, deckRebuilds: number) {
	const [health, setHealth] = useState<Record<string, any> | null>(null);

	useEffect(() => {
		if (!enabled) {
			// Reset of a debug-overlay poller that syncs external deck.gl state; not a render cascade.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setHealth(null);

			return;
		}
		const read = () => {
			const deck = deckRef.current?.deck;
			if (!deck) {
				setHealth({deck : "missing"});

				return;
			}
			const canvas      = deck.canvas as HTMLCanvasElement | undefined;
			const controllers = deck.viewManager?.controllers ?? {};
			const listening   = deck.eventManager?.getElement?.() ?? deck.eventManager?.element;
			setHealth({
				size             : `${deck.width}x${deck.height}`,
				viewports        : deck.viewManager?.getViewports?.().length ?? 0,
				controllers      : Object.keys(controllers).join(",") || "none",
				controllerProp   : !!deck.props.controller,
				listenerAttached : listening ? document.contains(listening) : false,
				listensOnCanvas  : !!canvas && !!listening && listening.contains(canvas),
				canvasInDoc      : !!canvas && document.contains(canvas),
				glLost           : !!deck.device?.isLost,
				rebuilds         : deckRebuilds,
			});
		};
		read();
		const timer = setInterval(read, 1000);

		return () => clearInterval(timer);
	}, [deckRef, enabled, deckRebuilds]);

	return health;
}

export function GameMap() {
	const map = useSnapshot(mapState);

	const deckRef = useRef<any>(null);

	// The view is UNCONTROLLED: deck owns pan/zoom on its own animation loop, so panning
	// doesn't re-render React every frame (which made deck reprocess props/layers per frame
	// — the source of the freezing). We lift state only when the pyramid LEVEL changes.
	//
	// Deck resets its view whenever initialViewState changes, so it doubles as how we push the
	// camera. Read the persisted view off the store, not the snapshot, or every save re-renders.
	const [viewState, setViewState] = useState<OrthoViewState>(() => {
		const saved = mapState.view;
		return {
			target  : [
				saved?.target[0] ?? INITIAL_TARGET[0],
				saved?.target[1] ?? INITIAL_TARGET[1],
				0
			],
			zoom    : saved?.zoom ?? INITIAL_ZOOM,
			minZoom : MIN_ZOOM,
			maxZoom : MAX_ZOOM
		};
	});

	// Deck binds its listeners once, to the `.deck-events-root` wrapping the canvas at init. If that
	// subtree is rebuilt under it, those listeners are orphaned — the map renders but takes no input
	// — and mjolnir's EventManager can't be re-pointed, so the only cure is a fresh Deck.
	const [deckKey, setDeckKey] = useState(0);
	useEffect(() => {
		const check = () => {
			const deck = deckRef.current?.deck;
			if (!deck?.isInitialized) {
				return;
			}
			const root   = deck.eventManager?.getElement?.() ?? deck.eventManager?.element;
			const canvas = deck.canvas;
			if (!root || !canvas || root.contains(canvas)) {
				return;
			}

			console.warn("world map: deck's event root no longer holds the canvas — rebuilding deck");
			// Seed from the last settled camera so the rebuild doesn't jump the view.
			const saved = mapState.view;
			if (saved) {
				setViewState({
					target  : [saved.target[0], saved.target[1], 0],
					zoom    : saved.zoom,
					minZoom : MIN_ZOOM,
					maxZoom : MAX_ZOOM,
				});
			}
			setDeckKey(k => k + 1);
		};

		const timer = setInterval(check, 1000);

		return () => clearInterval(timer);
	}, []);

	const focus = map.focusRequest;
	useEffect(() => {
		if (!focus) {
			return;
		}
		// Applies a one-shot focus request from cross-component map state to deck's camera.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setViewState({
			target                 : [focus.target[0], focus.target[1], 0],
			zoom                   : focus.zoom,
			minZoom                : MIN_ZOOM,
			maxZoom                : MAX_ZOOM,
			transitionDuration     : FOCUS_TRANSITION_MS,
			transitionInterpolator : new LinearInterpolator(["target", "zoom"]),
		});
		mapState.focusHandled();
	}, [focus]);

	// flipY:false => +Z (world Z) points UP the screen, i.e. north-up.
	const view = useMemo(() => new OrthographicView({id : "ortho", flipY : false}), []);

	// Uncontrolled deck owns the view, so drive the +/- buttons by handing its controller a
	// wheel event over the viewport centre rather than pushing viewState from React. Take the
	// canvas off deck itself — a document-wide lookup can find someone else's canvas.
	const zoomBy = useCallback((dir: number) => {
		const canvas: HTMLCanvasElement | undefined = deckRef.current?.deck?.canvas;
		if (!canvas) {
			return;
		}
		const r = canvas.getBoundingClientRect();
		canvas.dispatchEvent(new WheelEvent("wheel", {
			deltaY     : dir > 0 ? -240 : 240,
			clientX    : r.left + r.width / 2,
			clientY    : r.top + r.height / 2,
			bubbles    : true,
			cancelable : true,
		}));
	}, []);

	const layers = useMemo(() => {
		// The computed getters read below (iconNodes, contributionNodes, visibleNpcMarkers, …) come off
		// the snapshot; this memo's deps cover their inputs, so they can't be stale. The valtio rule
		// can't see that — the proper fix is proxy-memoize selectors, tracked as a separate task.

		const out: any[] = [];

		if (map.meta) {
			const baseZ = Math.min(MAP_WORLD_BASE_Z, map.tileZ);
			out.push(worldTileLayer(map.meta, baseZ, "world-base"));
			if (map.tileZ > baseZ) {
				out.push(worldTileLayer(map.meta, map.tileZ, "world-tiles"));
			}
		}

		// Region overlays (under the nodes/links). Drawn straight from world-space data.
		if (map.settings.showBounds) {
			out.push(new PolygonLayer<RegionBound>({
				id                 : "region-bounds",
				data               : map.regionBounds,
				coordinateSystem   : "cartesian",
				getPolygon         : d => d.polygon,
				stroked            : true,
				filled             : true,
				getFillColor       : [80, 140, 220, 24],
				getLineColor       : [120, 180, 240, 180],
				getLineWidth       : 1.5,
				lineWidthUnits     : "pixels",
				lineWidthMinPixels : 1,
			}));
		}
		if (map.settings.showSpawns) {
			out.push(new ScatterplotLayer<RegionPoint>({
				id               : "region-spawns",
				data             : map.regionSpawns,
				coordinateSystem : "cartesian",
				getPosition      : d => d.position,
				getRadius        : 2,
				radiusUnits      : "pixels",
				radiusMinPixels  : 1.5,
				getFillColor     : [120, 220, 255, 150],
			}));
		}
		if (map.settings.showRegionMarks) {
			out.push(new ScatterplotLayer<RegionPoint>({
				id               : "region-marks",
				data             : map.regionMarks,
				coordinateSystem : "cartesian",
				getPosition      : d => d.position,
				getRadius        : d => (d.kind === "extra" ? 7 : 5),
				radiusUnits      : "pixels",
				radiusMinPixels  : 3,
				getFillColor     : d => (d.kind === "extra" ? [255, 0, 0, 255] : [255, 220, 90, 230]),
				stroked          : true,
				getLineColor     : [12, 14, 18, 255],
				getLineWidth     : 1,
				lineWidthUnits   : "pixels",
			}));
		}

		out.push(new LineLayer<MapLinkSegment>({
			id                : "links",
			data              : map.linkSegments,
			coordinateSystem  : "cartesian",
			getSourcePosition : d => d.from,
			getTargetPosition : d => d.to,
			getColor          : d => d.color ?? [235, 180, 70, 190],
			getWidth          : d => d.width ?? 1.5,
			widthUnits        : "pixels",
			widthMinPixels    : 1,
		}));

		const iconWidth            = 170;
		const iconHeight           = 200;
		const iconSize             = 30;
		const iconScaleFactor      = 0.35;
		const iconHoverScaleFactor = 0.5;
		const subNodeScaleFactor   = 0.7;

		const iconNodes = map.iconNodes;
		const dotNodes  = map.dotNodes;

		out.push(new ScatterplotLayer<WrappedWorldNode>({
			id               : "node-dots",
			data             : dotNodes,
			pickable         : true,
			autoHighlight    : true,
			highlightColor   : [255, 255, 255, 140],
			coordinateSystem : "cartesian",
			getPosition      : n => n.mapPos,
			getRadius        : n => (n.main ? 6 : 3.5),
			radiusUnits      : "pixels",
			radiusMinPixels  : 4,

			getFillColor   : n => n.color,
			stroked        : true,
			lineWidthUnits : "pixels",
			getLineWidth   : 1.5,
			getLineColor   : [12, 14, 18, 255],
		}));


		const nodeKindScale = (n: WrappedWorldNode) => {
			switch (n.kind) {
				case 0:
				case 5:
					return 1.1;
				default:
					return 0.9;
			}
		};

		out.push(new IconLayer<WrappedWorldNode>({
			id               : "sub-node-icons",
			data             : iconNodes.filter(n => !n.main),
			pickable         : true,
			coordinateSystem : "cartesian",
			visible          : map.showSubNodes,
			getPosition      : n => n.mapPos,
			getIcon          : n => ({
				url    : n.icon(),
				id     : `k${n.kind}`,
				width  : iconWidth,
				height : iconHeight,
				mask   : false,
			}),
			getSize          : n => iconSize * nodeKindScale(n) * subNodeScaleFactor,
			sizeUnits        : "pixels",
			sizeMinPixels    : 20,
			sizeMaxPixels    : 60,
			sizeBasis        : "height"
		}));
		out.push(new IconLayer<WrappedWorldNode>({
			id               : "node-icons",
			data             : iconNodes.filter(n => n.main),
			pickable         : true,
			coordinateSystem : "cartesian",
			getPosition      : n => n.mapPos,
			getIcon          : n => ({
				url    : n.icon(),
				id     : `k${n.kind}`,
				width  : iconWidth,
				height : iconHeight,
				mask   : false,
			}),
			getSize          : n => (n.main ? iconSize + (iconSize * iconScaleFactor) : iconSize) * nodeKindScale(n),
			sizeUnits        : "pixels",
			sizeMinPixels    : 30,
			sizeMaxPixels    : 60,
			sizeBasis        : "height"
		}));


		// Every placed NPC, under the managers: same art drawn as a mask so getColor tints it, so the
		// managers keep the blue icon and stay distinguishable in a crowd.
		out.push(new IconLayer<NpcMarker>({
			id               : ALL_NPC_LAYER_ID,
			data             : map.visibleAllNpcMarkers,
			pickable         : true,
			autoHighlight    : true,
			highlightColor   : [255, 255, 255, 120],
			coordinateSystem : "cartesian",
			getPosition      : m => m.position,
			getIcon          : () => ({
				url    : NPC_ICON_URL,
				id     : "npc-mask",
				width  : NPC_ICON_PX,
				height : NPC_ICON_PX,
				mask   : true,
			}),
			getColor         : [226, 232, 240, 210],
			getSize          : 13,
			sizeUnits        : "pixels",
			sizeMinPixels    : 9,
			sizeMaxPixels    : 18,
		}));

		out.push(new IconLayer<NpcMarker>({
			id               : NPC_LAYER_ID,
			data             : map.visibleNpcMarkers,
			pickable         : true,
			autoHighlight    : true,
			highlightColor   : [255, 255, 255, 90],
			coordinateSystem : "cartesian",
			getPosition      : m => m.position,
			getIcon          : () => ({
				url    : NPC_ICON_URL,
				id     : "npc",
				width  : NPC_ICON_PX,
				height : NPC_ICON_PX,
				mask   : false,
			}),
			getSize          : 20,
			sizeUnits        : "pixels",
			sizeMinPixels    : 14,
			sizeMaxPixels    : 28,
		}));

		// hovered node drawn on top with its _h art; not pickable so hit-testing falls through to
		// the base "nodes" layer (keeps hover stable instead of flickering on itself).
		if (map.hoveredNode?.hasIcon) {
			const h = map.hoveredNode as WrappedWorldNode;
			out.push(new IconLayer<WrappedWorldNode>({
				id               : "node-hover",
				data             : [h],
				pickable         : false,
				coordinateSystem : "cartesian",
				getPosition      : n => n.mapPos,
				getIcon          : n => ({
					url    : n.icon(true),
					id     : `k${n.kind}_h`,
					width  : iconWidth,
					height : iconHeight,
					mask   : false,
				}),
				getSize          : n => (n.main ? iconSize + (iconSize * iconHoverScaleFactor) : iconSize) * nodeKindScale(n),
				sizeUnits        : "pixels",
				sizeMinPixels    : 40,
				sizeMaxPixels    : 70,
			}));
		}

		out.push(new TextLayer<WrappedWorldNode>({
			id                   : "contribution",
			data                 : map.contributionNodes,
			coordinateSystem     : "cartesian",
			getPosition          : n => n.mapPos,
			getText              : n => `${n.cp} CP`,
			getSize              : 11,
			sizeUnits            : "pixels",
			sizeMinPixels        : 7,
			getColor             : [255, 226, 150, 255],
			getPixelOffset       : [0, 14],
			getTextAnchor        : "middle",
			getAlignmentBaseline : "top",
			fontFamily           : FONT_FAMILY,
			fontWeight           : 700,
			fontSettings         : FONT_SETTINGS,
			characterSet         : CHARACTER_SET,
			outlineWidth         : OUTLINE_WIDTH,
			outlineColor         : OUTLINE_COLOR,
			background           : true,
			getBackgroundColor   : [9, 12, 17, 170],
			backgroundPadding    : [4, 2, 4, 2],
		}));

		out.push(new TextLayer<WrappedWorldNode>({
			id                   : "labels",
			data                 : map.labelNodes,
			coordinateSystem     : "cartesian",
			getPosition          : n => n.mapPos,
			getText              : n => n.name ?? "",
			getSize              : LABEL_SIZE_PX,
			sizeUnits            : "pixels",
			sizeMinPixels        : 8,
			getColor             : [245, 248, 252, 255],
			outlineWidth         : OUTLINE_WIDTH,
			outlineColor         : OUTLINE_COLOR,
			getPixelOffset       : [0, -18],
			getTextAnchor        : "middle",
			getAlignmentBaseline : "bottom",
			fontFamily           : FONT_FAMILY,
			fontWeight           : 700,
			fontSettings         : FONT_SETTINGS,
			characterSet         : CHARACTER_SET,
			lineHeight           : 1.1,
			background           : true,
			getBackgroundColor   : [9, 12, 17, 150],
			backgroundPadding    : [6, 3, 6, 3],
			updateTriggers       : {}
		}));

		return out;

		// The node-subset getters (icon/dot/label/contribution) are memoized off the listed inputs
		// (map.nodes + the visibility flags/zoom), so depend on those, not the getters' identities.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		deckKey,
		map.meta, map.tileZ, map.linkSegments, map.nodes, map.hoveredNode, map.shouldShowLabels,
		map.settings.showNodes, map.settings.showSubNodes,
		map.settings.showLabels, map.settings.showSubLabels,
		map.settings.showContribution,
		map.npcMarkers, map.settings.showNpcs,
		map.allNpcMarkers, map.settings.showAllNpcs, map.settings.npcRoles,
		map.regionBounds, map.regionSpawns, map.regionMarks,
		map.settings.showBounds, map.settings.showSpawns, map.settings.showRegionMarks,
		// also reveals the unnamed nodes the map otherwise hides
		map.settings.debugOverlay,
	]);

	const pickedNode = (info: PickingInfo): WrappedWorldNode | null => {
		return NODE_LAYER_IDS.includes(info.layer?.id ?? "") ? ((info.object as WrappedWorldNode) ?? null) : null;
	};

	const pickedNpc = (info: PickingInfo): NpcMarker | null => {
		const id = info.layer?.id ?? "";

		return id === NPC_LAYER_ID || id === ALL_NPC_LAYER_ID ? ((info.object as NpcMarker) ?? null) : null;
	};

	const handleClick = useCallback(
		(info: PickingInfo) => {
			const npc = pickedNpc(info);
			if (npc) {
				openSourceDetails(SourceKind.Npc, {id : npc.id, name : npc.name, urn : npc.urn});

				return;
			}
			const n = pickedNode(info);
			if (n) {
				mapState.updateNode(n, "select");
			}
		},
		[],
	);
	const handleHover = useCallback(
		(info: PickingInfo) => {
			// A manager's marker sits on top of its node, so keep that node in the info panel rather
			// than blanking it mid-reach. NPCs off the every-NPC layer belong to no node.
			const npc = pickedNpc(info);
			if (npc) {
				mapState.updateNode(npc.nodeURN ? mapState.graph.node(npc.nodeURN) ?? null : null, "hover");

				return;
			}
			mapState.updateNode(pickedNode(info), "hover");
		},
		[],
	);

	const controller = useMemo(() => ({
		doubleClickZoom : true,
		inertia         : 100,
	}), []);

	const onViewStateChange = useCallback((p: ViewStateChangeParameters<OrthographicViewState>) => {
		mapState.onViewStateChange(p);
	}, []);

	const getCursor = useCallback(
		({isDragging, isHovering}: { isDragging: boolean; isHovering: boolean }) =>
			isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
		[],
	);

	const getTooltip = useCallback((info: PickingInfo) => {
		const npc = pickedNpc(info);
		if (npc) {
			return npcTooltip(npc);
		}
		const n = pickedNode(info);

		return n ? nodeTooltip(n) : null;
	}, []);


	const [metrics, setMetrics] = useState<Record<string, any> | null>(null);
	const health                = useDeckHealth(deckRef, map.settings.debugOverlay, deckKey);

	return (
		<div
			style={{
				background : map.meta ? `rgb(${map.meta?.oceanColor[0]}, ${map.meta?.oceanColor[1]}, ${map.meta?.oceanColor[2]})` : "#0e1013"
			}}
			className={"absolute inset-0 overflow-hidden w-full h-full"}
		>
			<DeckGL<OrthographicView>
				key={deckKey}
				ref={deckRef}
				views={view}
				initialViewState={viewState}
				controller={controller}
				onViewStateChange={onViewStateChange}
				layers={layers}
				onClick={handleClick}
				onHover={handleHover}
				getCursor={getCursor}
				getTooltip={getTooltip}
				_onMetrics={map.settings.debugOverlay ? m => {
					setMetrics(c => ({...c, ...m}));
				} : undefined}
			/>

			{map.settings.debugOverlay && (
				<div className="absolute left-3 bottom-3 z-10 w-44 overflow-hidden rounded-md border border-zinc-700/70 bg-zinc-900/95 shadow-lg">
					<div className="flex flex-row items-center justify-between border-b border-zinc-800 px-2 py-1.5">
					<span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
						Debug Data
					</span>
					</div>
					<div className="p-1 max-h-64 overflow-y-auto ">
						{health && (
							<div className="mb-2">
								<div className="text-xs font-semibold text-zinc-200 mb-1">
									Interaction
								</div>
								{Object.entries(health).map(([key, value]) => (
									<MetricKv key={key} title={key} value={value} />
								))}
							</div>
						)}

						{metrics && (
							<div>
								<div className="text-xs font-semibold text-zinc-200 mb-1">
									Metrics
								</div>

								{Object.entries(metrics).map(([key, value]) => (
									<MetricKv key={key} title={key} value={value} />
								))}
							</div>
						)}

						{map?.selectedNode && (
							<div>
								<div className="text-xs font-semibold text-zinc-200 mb-1">
									Node
								</div>
								<div>
									<pre className="text-xs">
										<code>{JSON.stringify(map.selectedNode, null, 2)}</code>
									</pre>
								</div>
							</div>
						)}

					</div>
				</div>
			)}


			<div className={"absolute z-10 right-3 bottom-3 flex flex-col gap-1"}>
				<button
					className={cn([
						"text-zinc-200 hover:text-zinc-100 bg-zinc-900/90 hover:bg-zinc-800",
						"border border-zinc-700/70",
						"flex items-center justify-center",
						"w-8 h-8 text-lg font-bold",
						"rounded-t-md"
					])}
					onClick={() => zoomBy(0.6)}
					title="Zoom in"
				>
					<PlusIcon size={16} />
				</button>

				<button
					className={cn([
						"text-zinc-200 hover:text-zinc-100 bg-zinc-900/90 hover:bg-zinc-800",
						"border border-zinc-700/70",
						"flex items-center justify-center",
						"w-8 h-8 text-lg font-bold",
						"rounded-b-md"
					])}
					onClick={() => zoomBy(-0.6)}
					title="Zoom out"
				>
					<MinusIcon size={16} />
				</button>
			</div>
		</div>
	)
		;
}
