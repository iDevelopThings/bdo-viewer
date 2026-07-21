import {persistSync} from "@/lib/persist-sync.ts";
import type {Snapshot} from "valtio";
import type {MapLink, MapLinkSegment, NpcMarker, RegionBound, RegionPoint} from "@/components/world-map/types.ts";
import type {NPC, NPCSpawn, NPCSpawnType} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {WorldNodeKind} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetItemsByURN, GetNpcsByURN, GetPlacedNpcs, GetWorldNodes, GetWorldRegions, GetWorldTerritories} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import {NPC_ROLES} from "@/components/world-map/npc-roles.ts";
import {ref} from "valtio/vanilla";
import type {WorldMeta} from "@/components/world-map/map-config.ts";
import {fetchWorldMeta, MAP_LABEL_MIN_Z, WORLD_LAYER, INITIAL_ZOOM, FOCUS_ZOOM, worldToTile} from "@/components/world-map/map-config.ts";
import type {OrthographicViewState, ViewStateChangeParameters} from "@deck.gl/core";
import type {WrappedWorldNode} from "@/components/world-map/world-node.ts";
import {NodeGraph} from "@/components/world-map/world-node.ts";
import memoizeOne from "memoize-one";
import type {MaybeReadonly} from "@/types.ts";

/** Where the camera is: the world point at the centre of the viewport, and the zoom. */
export interface MapView {
	target: [number, number];
	zoom: number;
}

/** A request to fly the map somewhere. `id` makes each request distinct — see focusWorldPos. */
export interface FocusRequest extends MapView {
	id: number;
}

/** The NPC's placement closest to a point on the map plane, or undefined if they have none. */
function nearestSpawn(npc: MaybeReadonly<NPC>, to: [number, number]) {
	let best: MaybeReadonly<NPCSpawn> | undefined;
	let bestDist = Infinity;
	for (const s of npc.spawns ?? []) {
		if (s.pos.length < 3) {
			continue;
		}
		const dx   = s.pos[0] - to[0];
		const dz   = s.pos[2] - to[1];
		const dist = dx * dx + dz * dz;
		if (dist < bestDist) {
			best     = s;
			bestDist = dist;
		}
	}

	return best;
}

// The camera as it moves, held outside the store — see trackView.
const tracker: MapView & { timer: ReturnType<typeof setTimeout> | undefined } = {
	target : [0, 0],
	zoom   : INITIAL_ZOOM,
	timer  : undefined,
};

/** How long the camera must sit still before its position is committed (and persisted). */
const VIEW_SAVE_DELAY = 400;

let focusId = 0;
// The single in-flight (then settled) data load — see ensureLoaded.
let loadOnce: Promise<void> | undefined;

// A single stable empty array so "feature off" getters don't hand deck a fresh [] each render —
// a new data reference counts as a change and makes deck rebuild the layer's GPU buffers.
const EMPTY_NODES: WrappedWorldNode[] = [];
const EMPTY_NPC_MARKERS: NpcMarker[]  = [];

// The map's per-layer data is derived by filtering the world nodes. memoize-one keeps each result
// referentially stable while its inputs are unchanged, so deck.gl skips regenerating GPU buffers on
// unrelated renders (e.g. hover). graph.nodes is a ref() (stable until data reloads), so this holds
// across both proxy and snapshot reads. The getters below compose these (icon/dot/label off filtered).
const filteredNodesOf     = memoizeOne((nodes: WrappedWorldNode[], debugOverlay: boolean, showNodes: boolean, showSubNodes: boolean) =>
	nodes.filter(n => (n.named || debugOverlay) && (n.main ? showNodes : showSubNodes)));
const iconNodesOf         = memoizeOne((nodes: WrappedWorldNode[]) => nodes.filter(n => n.hasIcon));
const dotNodesOf          = memoizeOne((nodes: WrappedWorldNode[]) => nodes.filter(n => !n.hasIcon));
const contributionNodesOf = memoizeOne((nodes: WrappedWorldNode[]) => nodes.filter(n => n.cp > 0));
const labelNodesOf        = memoizeOne((nodes: WrappedWorldNode[], showSubLabels: boolean, tileZ: number) =>
	nodes.filter(n => {
		if (!showSubLabels && !n.main) {
			return false;
		}
		if (tileZ > 6) {
			return true;
		}
		if (tileZ >= 3) {
			return n.kind === WorldNodeKind.WorldNodeKindCity || n.kind === WorldNodeKind.WorldNodeKindVillage;
		}
		return true;
	}));
// NPC marker layers, memoized like the node getters above. isVisible(n) is inlined as
// n.named || debugOverlay to reuse the flag.
const visibleNpcMarkersOf    = memoizeOne((markers: NpcMarker[], graph: NodeGraph, debugOverlay: boolean) =>
	markers.filter(m => {
		const node = m.nodeURN ? graph.node(m.nodeURN) : undefined;
		return !node || node.named || debugOverlay;
	}));
const visibleAllNpcMarkersOf = memoizeOne((markers: NpcMarker[], roles: NPCSpawnType[] | null) =>
	roles ? markers.filter(m => m.spawnTypes?.some(t => roles.includes(t))) : markers);

/** World-map display settings + the settings panel's collapsed state, persisted so they
 *  survive reloads. */
export interface MapSettings {
	showNodes: boolean; // main nodes
	showSubNodes: boolean; // secondary nodes
	showLinks: boolean; // connections between nodes
	showLabels: boolean;
	showSubLabels: boolean; // sub-node labels (only when showLabels is true)
	showNpcs: boolean; // node manager / town representative markers
	showAllNpcs: boolean; // every placed NPC, filtered by npcRoles
	npcRoles: NPCSpawnType[] | null; // roles the all-NPC layer shows; null = every role
	showContribution: boolean; // CP cost badge on nodes that cost CP
	showBounds: boolean; // region AABB boxes
	showSpawns: boolean; // region NPC/monster spawn points
	showRegionMarks: boolean; // region worldmap-mark + extra positions
	panelCollapsed: boolean;
	debugOverlay: boolean; // show node metrics/debug overlay (debug)
}

export class MapController {
	public selectedNode: WrappedWorldNode | null = null;
	public hoveredNode: WrappedWorldNode | null  = null;

	public settings: MapSettings = {
		showNodes        : true,
		showSubNodes     : false,
		showLinks        : true,
		showLabels       : true,
		showSubLabels    : false,
		showNpcs         : false,
		showAllNpcs      : false,
		npcRoles         : null,
		showContribution : false,
		showBounds       : false,
		showSpawns       : false,
		showRegionMarks  : false,
		panelCollapsed   : false,
		debugOverlay     : false
	};

	public loading: boolean = true;

	/** Last settled camera position, persisted and restored on the next open. */
	public view: MapView | null              = null;
	/** Set by focusWorldPos; the map consumes it and flies there. */
	public focusRequest: FocusRequest | null = null;

	public graph: NodeGraph               = ref(new NodeGraph([], [], []));
	public links: MapLink[]               = [];
	public linkSegments: MapLinkSegment[] = [];

	/** Node managers / town representatives, at the placement nearest their node. */
	public npcMarkers: NpcMarker[]    = [];
	/** Every placed NPC, one marker per placement — loaded on demand, see ensureAllNpcs. */
	public allNpcMarkers: NpcMarker[] = [];

	private allNpcsLoaded: boolean  = false;
	private allNpcsLoading: boolean = false;

	public regionBounds: RegionBound[] = [];
	public regionSpawns: RegionPoint[] = [];
	public regionMarks: RegionPoint[]  = [];

	// Region overlays are a large, rarely-wanted payload (bounds, marks and every NPC/monster
	// spawn placement), so they load the first time an overlay setting is turned on.
	private regionsLoaded: boolean  = false;
	private regionsLoading: boolean = false;

	public meta: WorldMeta;

	private _tileZ: number = 0;

	/** Load the map data once. Callers outside the map want it too — an item's gather-node
	 *  chips name their nodes from the graph — so the in-flight load is shared, not repeated. */
	public ensureLoaded(): Promise<void> {
		if (!loadOnce) {
			loadOnce = this.loadData();
		}

		return loadOnce;
	}

	private async loadData() {
		this.loading = true;
		try {
			await Promise.all([
				this.loadWorldMeta(),
				this.loadNodes()
			]);
			if (this.wantsRegions) {
				void this.ensureRegions();
			}
			if (this.settings.showAllNpcs) {
				void this.ensureAllNpcs();
			}
		} catch (err) {
			console.error("Failed to load world map nodes", err);
			// Don't let a failed load settle into the shared promise — the next
			// ensureLoaded() should retry, not inherit a permanently blank map.
			loadOnce = undefined;
		} finally {
			this.loading = false;
		}
	}

	private async loadWorldMeta() {
		try {
			this.meta = await fetchWorldMeta(WORLD_LAYER);
			// The map mounts at the restored view, so seed the pyramid level from that zoom — deriving
			// it from INITIAL_ZOOM would leave everything keyed off tileZ (which labels to draw) wrong
			// until the first view change corrected it.
			this.tileZ = this.getMapPyramidZ(this.view?.zoom ?? INITIAL_ZOOM, this.meta);
		} catch (err) {
			console.error("Failed to load world meta", err);
		}
	}

	private async loadNodes() {
		const [nodes, territories] = await Promise.all([
			GetWorldNodes(),
			GetWorldTerritories()
		]);

		const productURNs = new Set<string>();
		const npcURNs     = new Set<string>();
		for (const n of nodes ?? []) {
			for (const p of n.products?.urns ?? []) {
				productURNs.add(p);
			}
			if (n.manager) {
				npcURNs.add(n.manager);
			}
			if (n.townRepresentative) {
				npcURNs.add(n.townRepresentative);
			}
		}
		const [items, npcs] = await Promise.all([
			GetItemsByURN([...productURNs]),
			GetNpcsByURN([...npcURNs])
		]);

		this.graph = ref(new NodeGraph(
			nodes ?? [],
			(items ?? []).filter(i => !!i),
			territories ?? [],
			(npcs ?? []).filter(n => !!n)
		));

		const links: MapLink[] = [];
		const seen             = new Set<string>();
		for (const n of this.graph.nodes) {
			for (const u of n.links?.urns ?? []) {
				const key = n.urn < u ? `${n.urn}-${u}` : `${u}-${n.urn}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);

				links.push({
					source : n.urn,
					target : u
				});
			}
		}
		this.links = ref(links);

		this.updateLinkSegments();
		this.buildNpcMarkers();
	}

	// One marker per manager, drawn at the node that owns them — their affiliates (which point back
	// via managerNode) share that one manager and must not each get a pin of their own. An NPC is a
	// character template with several placements, so pick the one nearest the owning node.
	private buildNpcMarkers() {
		const markers: NpcMarker[] = [];
		const add                  = (node: WrappedWorldNode, npc: NPC | undefined, role: NpcMarker["role"]) => {
			if (!npc) {
				return;
			}
			const spawn = nearestSpawn(npc, node.mapPos);
			if (!spawn) {
				return;
			}
			markers.push({
				position : [spawn.pos[0], spawn.pos[2]],
				name     : npc.name,
				title    : npc.title,
				role,
				urn      : npc.urn,
				id       : npc.id,
				nodeURN  : node.urn,
				nodeName : node.name,
			});
		};

		for (const n of this.graph.nodes) {
			if (n.ownsManager) {
				add(n, n.managerNpc(), "Node manager");
			}
			add(n, n.representativeNpc(), "Representative");
		}
		this.npcMarkers = ref(markers);
	}

	// Every placed NPC, one marker per placement (~2.4k) — only fetched once the layer is asked for.
	private async ensureAllNpcs() {
		if (this.allNpcsLoaded || this.allNpcsLoading) {
			return;
		}
		this.allNpcsLoading = true;
		try {
			const npcs                 = await GetPlacedNpcs();
			const markers: NpcMarker[] = [];
			for (const npc of npcs ?? []) {
				if (!npc) {
					continue;
				}
				for (const s of npc.spawns ?? []) {
					if (s.pos.length < 3) {
						continue;
					}
					markers.push({
						position   : [s.pos[0], s.pos[2]],
						name       : npc.name,
						title      : npc.title,
						role       : "NPC",
						urn        : npc.urn,
						id         : npc.id,
						regionName : s.regionName,
						spawnTypes : npc.spawnTypes ?? [],
					});
				}
			}
			this.allNpcMarkers = ref(markers);
			this.allNpcsLoaded = true;
		} catch (err) {
			console.error("Failed to load placed NPCs", err);
		} finally {
			this.allNpcsLoading = false;
		}
	}

	// Region overlays: world-space (x,y,z) -> map plane (x,z). Bounds become 4-corner polygons,
	// spawns and marks become points.
	private async ensureRegions() {
		if (this.regionsLoaded || this.regionsLoading) {
			return;
		}
		this.regionsLoading = true;
		try {
			const regions               = await GetWorldRegions();
			const bounds: RegionBound[] = [];
			const spawns: RegionPoint[] = [];
			const marks: RegionPoint[]  = [];
			for (const r of regions ?? []) {
				if (r.bounds) {
					const {min, max} = r.bounds;
					bounds.push({
						key     : r.key,
						name    : r.name,
						polygon : [[min[0], min[2]], [max[0], min[2]], [max[0], max[2]], [min[0], max[2]]],
					});
				}
				if (r.position.length) {
					marks.push({position : [r.position[0], r.position[2]], name : r.name, kind : "mark"});
				}
				for (const e of r.extraPositions ?? []) {
					marks.push({position : [e[0], e[2]], name : r.name, kind : "extra"});
				}
				for (const s of r.spawns ?? []) {
					spawns.push({position : [s.pos[0], s.pos[2]], kind : "spawn"});
				}
			}
			this.regionBounds  = ref(bounds);
			this.regionSpawns  = ref(spawns);
			this.regionMarks   = ref(marks);
			this.regionsLoaded = true;
		} catch (err) {
			console.error("Failed to load world regions", err);
		} finally {
			this.regionsLoading = false;
		}
	}

	private get wantsRegions(): boolean {
		return this.settings.showBounds || this.settings.showSpawns || this.settings.showRegionMarks;
	}

	private updateLinkSegments() {
		if (!this.settings.showLinks) {
			this.linkSegments = ref([]);
			return;
		}

		const visible = (n: WrappedWorldNode) => {
			// Otherwise we only want to draw links between nodes that are visible
			return this.isVisible(n) && (n.main ? this.settings.showNodes : this.settings.showSubNodes);
		};

		this.linkSegments = ref(this.links.flatMap(l => {
			const s = this.graph.node(l.source);
			const t = this.graph.node(l.target);
			if (!s || !t || !visible(s) || !visible(t)) {
				return [];
			}

			return [
				{
					from  : s.mapPos,
					to    : t.mapPos,
					color : l.color,
					width : l.width
				}
			];
		}));
	}

	public get nodes(): WrappedWorldNode[] {
		return this.graph.nodes;
	}

	/** The dormant/unreleased records the client has no name for are noise on the map — keep them
	 *  only when the debug overlay is on. */
	private isVisible(n: WrappedWorldNode): boolean {
		return n.named || this.settings.debugOverlay;
	}

	// isVisible(n) === n.named || debugOverlay, inlined into filteredNodesOf to reuse the flag.
	public get filteredNodes(): WrappedWorldNode[] {
		return filteredNodesOf(this.graph.nodes, this.settings.debugOverlay, this.settings.showNodes, this.settings.showSubNodes);
	}

	// The node layers split filteredNodes by whether a node draws an icon or a dot; memoized so
	// their data references stay stable across renders that don't change the underlying nodes.
	public get iconNodes(): WrappedWorldNode[] {
		return iconNodesOf(this.filteredNodes);
	}

	public get dotNodes(): WrappedWorldNode[] {
		return dotNodesOf(this.filteredNodes);
	}

	// Labels thin out with zoom: everything above tileZ 6, only cities/villages at 3–6, and
	// sub-node labels only when their toggle is on.
	public get labelNodes(): WrappedWorldNode[] {
		if (!this.showLabels) {
			return EMPTY_NODES;
		}
		return labelNodesOf(this.filteredNodes, this.settings.showSubLabels, this.tileZ);
	}

	/** NPC markers to draw, or none while the toggle is off. */
	public get visibleNpcMarkers(): NpcMarker[] {
		if (!this.settings.showNpcs) {
			return EMPTY_NPC_MARKERS;
		}

		return visibleNpcMarkersOf(this.npcMarkers, this.graph, this.settings.debugOverlay);
	}

	public get showNpcs() {
		return this.settings.showNpcs;
	}

	public set showNpcs(v: boolean) {
		this.settings.showNpcs = v;
	}

	/** Every placed NPC whose roles are selected. A null npcRoles means every role — an NPC with no
	 *  role at all (spawnTypes empty) only shows when nothing is filtered out. */
	public get visibleAllNpcMarkers(): NpcMarker[] {
		if (!this.settings.showAllNpcs) {
			return EMPTY_NPC_MARKERS;
		}

		return visibleAllNpcMarkersOf(this.allNpcMarkers, this.settings.npcRoles);
	}

	/** The roles the filter offers: the ones actually carried by a placed NPC (37 of the enum's 46),
	 *  falling back to the full enum until they're loaded. */
	public get npcRoleOptions(): NPCSpawnType[] {
		if (!this.allNpcMarkers.length) {
			return NPC_ROLES;
		}
		const present = new Set<NPCSpawnType>();
		for (const m of this.allNpcMarkers) {
			for (const t of m.spawnTypes ?? []) {
				present.add(t);
			}
		}

		return [...present].sort((a, b) => a - b);
	}

	public get showAllNpcs() {
		return this.settings.showAllNpcs;
	}

	public set showAllNpcs(v: boolean) {
		this.settings.showAllNpcs = v;
		if (v) {
			void this.ensureAllNpcs();
		}
	}

	public get npcRoles(): NPCSpawnType[] | null {
		return this.settings.npcRoles;
	}

	// null (every role) rather than a full list, so a client patch adding a role shows up by default.
	public set npcRoles(v: NPCSpawnType[] | null) {
		this.settings.npcRoles = v && v.length === this.npcRoleOptions.length ? null : v;
	}

	/** Nodes drawing an on-map CP badge. */
	public get contributionNodes(): WrappedWorldNode[] {
		if (!this.settings.showContribution) {
			return EMPTY_NODES;
		}
		return contributionNodesOf(this.filteredNodes);
	}

	public get showLinks() {
		return this.settings.showLinks;
	}

	public set showLinks(v: boolean) {
		this.settings.showLinks = v;
		this.updateLinkSegments();
	}

	public get showNodes() {
		return this.settings.showNodes;
	}

	public set showNodes(v: boolean) {
		this.settings.showNodes = v;
		this.updateLinkSegments();
	}

	public get showSubNodes() {
		return this.settings.showSubNodes;
	}

	public set showSubNodes(v: boolean) {
		this.settings.showSubNodes = v;
		this.updateLinkSegments();
	}

	public get shouldShowLabels() {
		return this.settings.showLabels && this.tileZ >= MAP_LABEL_MIN_Z;
	}

	public get showLabels() {
		return this.settings.showLabels;
	}

	public set showLabels(v: boolean) {
		this.settings.showLabels = v;
	}

	public get showContribution() {
		return this.settings.showContribution;
	}

	public set showContribution(v: boolean) {
		this.settings.showContribution = v;
	}

	public get showBounds() {
		return this.settings.showBounds;
	}

	public set showBounds(v: boolean) {
		this.settings.showBounds = v;
		if (v) {
			void this.ensureRegions();
		}
	}

	public get showSpawns() {
		return this.settings.showSpawns;
	}

	public set showSpawns(v: boolean) {
		this.settings.showSpawns = v;
		if (v) {
			void this.ensureRegions();
		}
	}

	public get showRegionMarks() {
		return this.settings.showRegionMarks;
	}

	public set showRegionMarks(v: boolean) {
		this.settings.showRegionMarks = v;
		if (v) {
			void this.ensureRegions();
		}
	}

	public get selectedNodeTilePos(): string | undefined {
		if (!this.selectedNode) {
			return undefined;
		}

		const [x, z] = worldToTile(...this.selectedNode.mapPos);
		return `(${x}, ${z})`;
	}

	public get tileZ() {
		return this._tileZ;
	}

	public set tileZ(z: number) {
		/* if (z === this._tileZ) {
			return;
		} */

		this._tileZ = z;
	}

	// We pick the pyramid level ourselves rather than trust deck's non-geo z heuristic (which
	// sits on the coarsest level for this huge-tileSize setup). At OrthographicView zoom Z, one
	// screen pixel is 2^Z world units; a native (z=maxZoom) tile pixel is unitsPerPixel world
	// units. They're 1:1 when z = Z + maxZoom + log2(unitsPerPixel) — round to that so tiles
	// render ~1:1 instead of upscaled (blurry) or heavily downscaled.
	public getMapPyramidZ(viewZoom: number, meta?: WorldMeta): number {
		if (this.loading && !meta) {
			throw new Error("World meta not loaded");
		}

		const m = meta ?? this.meta;
		if (!m) {
			throw new Error("World meta not loaded");
		}

		const crisp = viewZoom + m.maxZoom + Math.log2(m.unitsPerPixel);
		return Math.max(0, Math.min(m.maxZoom, Math.round(crisp)));
	}

	// Fires every frame while panning, but we only re-render (setTileZ) when the integer
	// pyramid level actually changes — so pure panning triggers zero React renders.
	public onViewStateChange(params: ViewStateChangeParameters<OrthographicViewState>): void {
		this.tileZ = this.getMapPyramidZ(params.viewState.zoom as number);

		const {target, zoom} = params.viewState;
		this.trackView([(target as number[])[0], (target as number[])[1]], zoom as number);
	}

	// The camera moves every frame, so the live value is parked outside the store (writing it
	// through would re-render React and re-save on each frame) and only committed once it settles.
	private trackView(target: [number, number], zoom: number) {
		tracker.target = target;
		tracker.zoom   = zoom;

		clearTimeout(tracker.timer);
		tracker.timer = setTimeout(() => {
			this.view = ref({target : tracker.target, zoom : tracker.zoom});
		}, VIEW_SAVE_DELAY);
	}

	/** Move the map to a world position — the entry point for "show me this on the map" from
	 *  anywhere else in the app (a vendor's spawn, a grind spot's node, …). Accepts a game
	 *  [x, y, z] or an already-flattened [x, z]. */
	public focusWorldPos(pos: MaybeReadonly<number[]>, zoom: number = FOCUS_ZOOM) {
		const target: [number, number] = pos.length >= 3 ? [pos[0], pos[2]] : [pos[0], pos[1]];
		this.focusRequest              = ref({
			target,
			zoom,
			// Deck resets the view when initialViewState changes, so re-focusing the same place must
			// still produce a new value to react to.
			id : ++focusId,
		});
	}

	/** Called by the map once it has flown to a request. Without this the request would sit in the
	 *  store and re-fire the next time the map mounts, overriding the restored view. */
	public focusHandled() {
		this.focusRequest = null;
	}

	/** Fly to a node and select it, so the info panel opens on it. */
	public focusNode(node: WrappedWorldNode, zoom: number = FOCUS_ZOOM) {
		this.updateNode(node, "select");
		this.focusWorldPos(node.mapPos, zoom);
	}

	/** Fly to a node by urn — for callers holding only a node ref (an item's gather node, a grind
	 *  spot's node). Loads the map data first, since the caller may never have opened the map.
	 *  Resolves false when no such node exists. */
	public async focusNodeURN(urn: string, zoom: number = FOCUS_ZOOM): Promise<boolean> {
		await this.ensureLoaded();

		const node = this.graph.node(urn);
		if (!node) {
			return false;
		}
		this.focusNode(node, zoom);

		return true;
	}

	// ref() so valtio hands the wrapped node itself back out — a proxied copy would break the
	// identity check the hover layer relies on, and needlessly deep-proxy the node graph.
	public updateNode(node: WrappedWorldNode | null, mode: "hover" | "select") {
		const v = node ? ref(node) : null;
		if (mode === "hover") {
			this.hoveredNode = v;
		} else {
			this.selectedNode = v;
		}
	}
}


const mapPersist = persistSync<MapController>(new MapController(), "map", {
	debounceTime          : 500,
	mergeStrategy         : {
		isAsync : false,
		merge   : (initialState, restoredState) => {
			// Merge settings key-by-key: a persisted blob predating a new toggle would otherwise
			// drop that toggle's default and leave it undefined.
			const settings  = {...initialState.settings, ...(restoredState?.settings ?? {})};
			const result    = Object.assign(initialState, restoredState);
			result.settings = settings;
			return result;
		},
	},
	serializationStrategy : {
		isAsync : false,
		serialize(state: Snapshot<MapController>): string {
			if (!state) {
				return JSON.stringify({});
			}

			return JSON.stringify({
				settings : state.settings,
				view     : state.view,
			});
		},
		deserialize(data: string): MapController {
			if (!data || data === "{}") {
				return {} as unknown as MapController;
			}
			return JSON.parse(data);
		}
	}
});
// Long-lived singleton: subscribe for the app's lifetime. On HMR drop the old subscription so a
// re-executed module doesn't stack a second persist writer over the previous instance.
const stopMapPersist = mapPersist.subscribe();
import.meta.hot?.dispose(() => stopMapPersist());
export const mapState = mapPersist.store;
