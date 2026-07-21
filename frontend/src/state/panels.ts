import type {DockviewApi, DockviewIDisposable as IDisposable, IDockviewPanel} from "dockview-react";
import {useSyncExternalStore} from "react";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {MaybeReadonly} from "@/types.ts";
import type {WrappedSource} from "@/state/sources/sources.ts";
import {findSourceByType, findSourceByURN} from "@/state/sources/sources.ts";
import {navigateToURN, getNavigationNodeByURN} from "@/state/navigation.tsx";
import {mapState} from "@/components/world-map/map-state.ts";
import {addHistoryEntry} from "@/components/history/history.tsx";

// Describes a piece of content to show in a panel — not tied to any specific
// dockview panel id/slot, so any source (items, npcs, zones, ...) can use it.
export type PanelRequest<P extends object = Record<string, unknown>> = {
	// The kind of content, e.g. "item", "npc" - namespaces the pinned panel id.
	source: string;
	// Uniquely identifies this content within `source` — the urn for entity panels,
	// a stable literal (e.g. "settings") for tool panels.
	key: string;
	// Canonical cross-source identifier, when available.
	urn?: string;
	// The registered dockview component that renders this content.
	component: string;
	title: string;
	params?: P;
}

export type OpenPanelOptions = {
	// Open (or focus) a persistent tab instead of reusing the shared preview panel.
	// Defaults to false.
	pinned?: boolean;
}

const PREVIEW_PANEL_ID = "preview";

let _api: DockviewApi | undefined;

// api.panels is dockview's own live panel list - nothing here duplicates it.
// This just bridges "a panel was added/removed/re-targeted" into React via
// useSyncExternalStore, so callers can ask api.panels directly on each notify.
const changeListeners           = new Set<() => void>();
const panelListeners            = new Map<string, IDisposable>();
let apiListeners: IDisposable[] = [];

function notifyChange() {
	changeListeners.forEach(cb => cb());
}

function trackPanel(panel: IDockviewPanel) {
	panelListeners.set(panel.id, panel.api.onDidParametersChange(notifyChange));
}

function untrackPanel(id: string) {
	panelListeners.get(id)?.dispose();
	panelListeners.delete(id);
}

export function setDockviewApi(instance: DockviewApi | undefined) {
	apiListeners.forEach(d => d.dispose());
	apiListeners = [];
	panelListeners.forEach(d => d.dispose());
	panelListeners.clear();

	_api               = instance;
	window.dockviewApi = instance;

	if (!_api) {
		console.error("Dockview API is not available. Panels will not function correctly.");
	}

	if (instance) {
		apiListeners.push(instance.onDidAddPanel(panel => {
			trackPanel(panel);
			notifyChange();
		}));
		apiListeners.push(instance.onDidRemovePanel(panel => {
			untrackPanel(panel.id);
			notifyChange();
		}));
		apiListeners.push(instance.onDidActivePanelChange(() => notifyChange()));
		instance.panels.forEach(trackPanel);
	}
	notifyChange();
}

// The id of the currently focused dockview panel, or undefined. Backs the rail's
// active-tool highlight; re-reads on any add/remove/active-panel change.
export function useActivePanelId(): string | undefined {
	// Reads _api directly, not getDockviewApi(): this runs on first render before
	// dockview mounts, where a missing api is expected — logging it would be noise.
	return useSyncExternalStore(subscribePanelChanges, () => _api?.activePanel?.id);
}

function subscribePanelChanges(callback: () => void): () => void {
	changeListeners.add(callback);
	return () => changeListeners.delete(callback);
}

export function getDockviewApi() {
	if (!_api) {
		console.error("Dockview API is not available. Panels will not function correctly.");
	}
	return _api;
}

function panelId(request: Pick<PanelRequest, "source" | "key" | "urn">, pinned: boolean) {
	return pinned ? request.urn ?? `${request.source}:${request.key}` : PREVIEW_PANEL_ID;
}

function entryURNForSource(source: string, key: string, explicit?: string): string | undefined {
	if (explicit) {
		return explicit;
	}
	return findSourceByType(source as SourceKind)?.entryURN(key);
}

// Opens `request` in a panel.
//
// - Default (preview): reuses a single shared panel, swapping its params/title in place -
//   repeated clicks don't pile up tabs.
// - Pinned: a persistent tab keyed by `${source}:${key}`; re-opening the same one just
//   focuses the existing tab instead of erroring on a duplicate id.
export function openPanel<P extends object>(request: PanelRequest<P>, options: OpenPanelOptions = {}): IDockviewPanel | undefined {
	const api = getDockviewApi();
	if (!api) {
		console.warn("openPanel: dockview api is not ready yet");
		return undefined;
	}

	const params = {
		...(request.params ?? {}),
		source : request.source,
		key    : request.key,
		urn    : entryURNForSource(request.source, request.key, request.urn),
	};

	const id       = panelId({...request, urn : params.urn}, options.pinned ?? false);
	const existing = api.getPanel(id);

	if (existing) {
		existing.api.updateParameters(params);
		existing.api.setTitle(request.title);
		existing.api.setActive();
		return existing;
	}

	// Anchor new panels next to whatever's already open as a tab in the same group,
	// so the first click has somewhere to land and later ones stay grouped together.
	// const openPanels = api.panels;

	let previewGroup = api.getGroup("right");
	if (!previewGroup) {
		previewGroup = api.addGroup({
			id             : "right",
			initialWidth   : 400,
			referenceGroup : api.getGroup("center")?.id,
			direction      : "right"
		});
	}

	const listPanel = api.getPanel("list");


	return api.addPanel({
		id,
		component : request.component,
		title     : request.title,
		params    : params,
		position  :
			previewGroup
				? {referenceGroup : previewGroup.id, direction : "within"}
				: {
					referencePanel : listPanel?.id,
					direction      : listPanel ? "right" : "within"
				}
	});
}

// openItemPanel opens the shared item-details panel for a urn. `title` is optional:
// the panel titles itself from the entry it loads (see DetailsPanel), so a bare urn
// (a link, persisted state) is enough. Pass it when the caller already has the title
// to skip the tab briefly showing the urn before the load resolves.
export function openItemPanel(urn: string, opts: { title?: string; pinned?: boolean } = {}) {
	return openSourceDetails(SourceKind.Item, urn, opts);
}

export function openSourceDetails(source: SourceKind, urn: string, opts: { title?: string; pinned?: boolean } = {}) {
	const p = openPanel({
		source,
		key       : urn,
		urn,
		component : "itemDetails",
		title     : opts.title ?? urn,
	}, {pinned : opts.pinned});

	if (p) {
		addHistoryEntry({type : source, urn, value : {name : opts.title}});
	}

	return p;
}

export function openGearBuilderPanel(buildId: string = "default") {
	return openPanel({
		source    : "gear",
		key       : buildId,
		component : "gearBuilder",
		title     : "Gear Builder"
	}, {pinned : true});
}

export function openSettingsPanel() {
	return openPanel({
		source    : "settings",
		key       : "settings",
		component : "settings",
		title     : "Settings"
	}, {pinned : true});
}

export function openMapPanel() {
	return openPanel({
		source    : "worldMap",
		key       : "worldMap",
		component : "worldMap",
		title     : "World Map"
	}, {pinned : true});
}

/** Open the world map on a place: a vendor's spawn, a grind spot's position, anything with a world
 *  position. Takes a game [x, y, z] (or a flattened [x, z]). The map picks the request up when it
 *  mounts, so this works whether or not the panel was already open. */
export function openMapAt(pos: MaybeReadonly<number[]>, zoom?: number) {
	const panel = openMapPanel();
	mapState.focusWorldPos(pos, zoom);

	return panel;
}

/** Open the world map on a node (an item's gather node, a grind spot's node), selecting it so the
 *  info panel opens with it. */
export function openMapAtNode(urn: string, zoom?: number) {
	const panel = openMapPanel();
	void mapState.focusNodeURN(urn, zoom);

	return panel;
}

export function openCraftCalculatorPanel() {
	return openPanel({
		source    : "calc",
		key       : "calc",
		component : "craftCalc",
		title     : "Crafting Calculator"
	}, {pinned : true});
}

export function openCompareItemsPanel() {
	return openPanel({
		source    : "compare",
		key       : "compare",
		component : "compareItems",
		title     : "Compare Items"
	}, {pinned : true});
}

export function isPanelOpen<P extends object>(request: Pick<PanelRequest<P>, "source" | "key"> & { urn?: string }, options: OpenPanelOptions = {}): boolean {
	return !!getDockviewApi()?.getPanel(panelId(request, options.pinned ?? false));
}

export function closePanel<P extends object>(request: Pick<PanelRequest<P>, "source" | "key"> & { urn?: string }, options: OpenPanelOptions = {}) {
	const panel = getDockviewApi()?.getPanel(panelId(request, options.pinned ?? false));
	if (panel) {
		getDockviewApi()?.removePanel(panel);
	}
}

// Scans the live api.panels list directly - no separate state to keep in sync.
// Reads _api (not getDockviewApi): a passive render-time read that runs before
// dockview mounts, where a missing api is expected rather than an error.
export function isURNPanelOpen(urn: string | undefined): boolean {
	if (!urn) {
		return false;
	}
	return !!_api?.panels.some(p => (p.params as { urn?: string }).urn === urn);
}

export function useIsContentPanelOpen(urn: string | undefined): boolean {
	return useSyncExternalStore(
		subscribePanelChanges,
		() => isURNPanelOpen(urn),
	);
}

export type GoToURNOptions = {
	pinned?: boolean;
	title?: string;
	prefer?: "panel" | "navigation";
};

export function goToURN(urn: string | null | undefined, options: GoToURNOptions = {}): boolean {
	if (!urn) {
		return false;
	}

	if (options.prefer === "navigation" && navigateToURN(urn)) {
		return true;
	}

	let source: WrappedSource | undefined;
	try {
		source = findSourceByURN(urn);
	} catch (error) {
		console.warn("goToURN: invalid urn", urn, error);
		return false;
	}
	const sourceRef = source?.entryFromURN(urn);
	if (sourceRef) {
		const navNode = getNavigationNodeByURN(urn);
		openSourceDetails(sourceRef.source, urn, {
			title  : options.title ?? navNode?.title,
			pinned : options.pinned ?? false,
		});
		return true;
	}

	return navigateToURN(urn);
}
