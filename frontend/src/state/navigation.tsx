import {persist} from "valtio-persist";
import {ref} from "valtio/vanilla";
import {SourceKind, SourceNavigationNode} from "@bindings/bdo-viewer/internal/sources";
import {findSourceByType, type WrappedSource} from "@/state/sources/sources.ts";
import {useSnapshot} from "valtio/react";

export type NavigationState = {
	activePath?: string;
	expandedPaths: Record<string, boolean>;
	rootNodes: SourceNavigationNode[];
	nodesByPath: Map<string, SourceNavigationNode>;
	nodesByURN: Map<string, SourceNavigationNode>;
	originalIdsByPath: Map<string, string>;
}

export type NavigationListScope = {
	// kind is the node's source kind, which the source itself can't provide for
	// SourceKind.All - it's the cross-source search node, not a registered source.
	kind?: SourceKind;
	source?: WrappedSource;
	category?: string;
	subcategory?: string;
	pathParts: string[];
}

export const {store : navigation} = await persist<NavigationState>(
	{
		activePath        : undefined,
		expandedPaths     : {},
		rootNodes         : [],
		nodesByPath       : new Map<string, SourceNavigationNode>(),
		nodesByURN        : new Map<string, SourceNavigationNode>(),
		originalIdsByPath : new Map<string, string>(),
	},
	"navigation",
);

// A build that persisted expandedPaths as an array leaves the restored value an array;
// reset it so the record stays a plain object (string-keyed props on an array wouldn't persist).
if (Array.isArray(navigation.expandedPaths)) {
	navigation.expandedPaths = {};
}

export function buildNavigationTree(tree: SourceNavigationNode[]) {
	const nodesByPath       = new Map<string, SourceNavigationNode>();
	const nodesByURN        = new Map<string, SourceNavigationNode>();
	const originalIdsByPath = new Map<string, string>();

	const indexNode = (node: SourceNavigationNode) => {
		nodesByPath.set(node.path, node);
		originalIdsByPath.set(node.path, node.id);

		if (node.urn) {
			nodesByURN.set(node.urn, node);
		}

		node.children?.forEach(indexNode);
	};

	tree.forEach(indexNode);

	navigation.rootNodes         = ref(tree);
	navigation.nodesByPath       = ref(nodesByPath);
	navigation.nodesByURN        = ref(nodesByURN);
	navigation.originalIdsByPath = ref(originalIdsByPath);

	// Nothing to restore (fresh launch), or a persisted path that no longer exists
	// after a data change - fall back to the first root, the global search node.
	if (!navigation.activePath || !nodesByPath.has(navigation.activePath)) {
		navigation.activePath = tree[0]?.path;
	}
}

export function getNavigationNode(path: string | undefined): SourceNavigationNode | undefined {
	return path ? navigation.nodesByPath.get(path) : undefined;
}

export function getNavigationNodeByURN(urn: string | undefined): SourceNavigationNode | undefined {
	return urn ? navigation.nodesByURN.get(urn) : undefined;
}

export function getActiveNavigationNode(): SourceNavigationNode | undefined {
	return getNavigationNode(navigation.activePath);
}

export function navigate(path: string): boolean {
	if (!navigation.nodesByPath.has(path)) {
		console.warn(`Navigation node with path ${path} not found`, navigation.nodesByPath);
		return false;
	}

	navigation.activePath = path;
	expandPathParents(path);
	return true;
}

export function navigateToURN(urn: string | undefined): boolean {
	const node = getNavigationNodeByURN(urn);
	return node ? navigate(node.path) : false;
}

export function toggleExpanded(path: string) {
	if (navigation.expandedPaths[path]) {
		delete navigation.expandedPaths[path];
	} else {
		navigation.expandedPaths[path] = true;
	}
}

export function isExpanded(path: string): boolean {
	return !!navigation.expandedPaths[path];
}

export function useIsExpanded(path: string): boolean {
	return !!useSnapshot(navigation).expandedPaths[path];
}

export function getNavigationSource(path?: string): WrappedSource | undefined {
	const sourceKind = getNavigationNode(path)?.source;
	return sourceKind ? findSourceByType(sourceKind) : undefined;
}

export function getNavigationListScope(path?: string): NavigationListScope {
	const source    = getNavigationSource(path);
	const pathParts = getOriginalPathParts(path);

	return {
		kind        : getNavigationNode(path)?.source,
		source,
		category    : pathParts[0],
		subcategory : pathParts[1],
		pathParts,
	};
}

export function getDefaultNavigationPath(): string | undefined {
	return navigation.activePath ?? navigation.rootNodes[0]?.path;
}

function expandPathParents(path: string) {
	const parts = path.split("/");
	for (let i = 0; i < parts.length; i++) {
		const parentPath                     = parts.slice(0, i + 1).join("/");
		navigation.expandedPaths[parentPath] = true;
	}
}

function getOriginalPathParts(path?: string): string[] {
	if (!path) {
		return [];
	}

	const parts      = path.split("/");
	const sourcePath = parts.shift();
	if (!sourcePath) {
		return [];
	}

	const ids: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		const partPath = parts.slice(0, i + 1).join("/");
		const id       = navigation.originalIdsByPath.get(`${sourcePath}/${partPath}`);
		if (id !== undefined) {
			ids.push(id);
		}
	}

	return ids;
}
