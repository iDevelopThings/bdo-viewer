import type {DockviewApi, DockviewIDisposable as IDisposable, IDockviewPanel} from "dockview-react";
import {useSyncExternalStore} from "react";
import {Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {MaybeReadonly} from "@/types.ts";
import {ItemURN} from "@/lib/urn.ts";
import {findSourceByType, findSourceByURN, WrappedSource} from "@/state/sources/sources.ts";
import {navigateToURN, getNavigationNodeByURN} from "@/state/navigation.tsx";
import {mapState} from "@/components/world-map/map-state.ts";
import {addHistoryEntry} from "@/components/history/history.tsx";

// Describes a piece of content to show in a panel — not tied to any specific
// dockview panel id/slot, so any source (items, npcs, zones, ...) can use it.
export type PanelRequest<P extends object = Record<string, unknown>> = {
	// The kind of content, e.g. "item", "npc" - namespaces the pinned panel id.
	source: string;
	// Uniquely identifies this content within `source`, e.g. an item id.
	key: string | number;
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

let api: DockviewApi | undefined;

// api.panels is dockview's own live panel list - nothing here duplicates it.
// This just bridges "a panel was added/removed/re-targeted" into React via
// useSyncExternalStore, so callers can ask api.panels directly on each notify.
const changeListeners           = new Set<() => void>();
const panelListeners            = new Map<string, IDisposable>();
let apiListeners: IDisposable[] = [];

function notifyChange() {
	changeListeners.forEach(cb => cb());
}

function contentKeyOf(params: Record<string, unknown> | undefined): string | undefined {
	if (params?.urn !== undefined) {
		return String(params.urn);
	}
	return params?.source !== undefined && params?.key !== undefined
		? `${params.source}:${params.key}`
		: undefined;
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

	api = instance;

	window.dockviewApi = instance;

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
	return useSyncExternalStore(subscribePanelChanges, () => api?.activePanel?.id);
}

function subscribePanelChanges(callback: () => void): () => void {
	changeListeners.add(callback);
	return () => changeListeners.delete(callback);
}

export function getDockviewApi() {
	return api;
}

function panelId(request: Pick<PanelRequest, "source" | "key" | "urn">, pinned: boolean) {
	return pinned ? request.urn ?? `${request.source}:${request.key}` : PREVIEW_PANEL_ID;
}

function entryURNForSource(source: string, key: string | number, explicit?: string): string | undefined {
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

		/* position  : referencePanel
			? {referencePanel : referencePanel.id, direction : "within"}
			: undefined, */
	});
}

export type ItemPanelItem = Item | { id: string | number, name: string }

export function openItemPanel(item: MaybeReadonly<ItemPanelItem>, pinned: boolean = false) {

	const p = openPanel({
		source    : SourceKind.Item,
		key       : item.id,
		urn       : ItemURN.new(item.id),
		component : "itemDetails",
		title     : item.name
	}, {pinned});

	if (p) {
		addHistoryEntry({type : SourceKind.Item, urn : ItemURN.new(item.id), value : item});
	}

	return p;
}

export function openSourceDetails(source: SourceKind, value: { id: string | number, name: string, urn?: string }, pinned: boolean = false) {
	const p = openPanel({
		source    : source,
		key       : value.id,
		urn       : value.urn,
		component : "itemDetails",
		title     : value.name
	}, {pinned});

	if (p) {
		addHistoryEntry({type : source, urn : entryURNForSource(source, value.id, value.urn), value : value});
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
	return !!api?.getPanel(panelId(request, options.pinned ?? false));
}

export function closePanel<P extends object>(request: Pick<PanelRequest<P>, "source" | "key"> & { urn?: string }, options: OpenPanelOptions = {}) {
	const panel = api?.getPanel(panelId(request, options.pinned ?? false));
	if (panel) {
		api?.removePanel(panel);
	}
}

// Scans the live api.panels list directly - no separate state to keep in sync.
export function isContentPanelOpen(source: string, key: string | number): boolean {
	const contentKey = `${source}:${key}`;
	return !!api?.panels.some(p => contentKeyOf(p.params) === contentKey);
}

export function isURNPanelOpen(urn: string | undefined): boolean {
	if (!urn) {
		return false;
	}
	return !!api?.panels.some(p => contentKeyOf(p.params) === urn);
}

export function useIsContentPanelOpen(source: string, key: string | number, urn?: string): boolean {
	return useSyncExternalStore(
		subscribePanelChanges,
		() => isURNPanelOpen(urn) || isContentPanelOpen(source, key),
	);
}

export type GoToURNOptions = {
	pinned?: boolean;
	title?: string;
	prefer?: "panel" | "navigation";
};

export function goToURN(urn: string | undefined, options: GoToURNOptions = {}): boolean {
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
		openSourceDetails(
			sourceRef.source,
			{
				id   : sourceRef.key,
				name : options.title ?? navNode?.title ?? urn,
				urn,
			},
			options.pinned ?? false,
		);
		return true;
	}

	return navigateToURN(urn);
}
