import {persist} from "valtio-persist";
import {ref} from "valtio/vanilla";
import {SourceNavigationNode} from "@bindings/bdo-viewer/internal/sources";
import {findSourceByType, type WrappedSource} from "@/state/sources/sources.ts";

export type NavigationState = {
	activePath?: string;
	expandedPaths: string[];
	rootNodes: SourceNavigationNode[];
	nodesByPath: Map<string, SourceNavigationNode>;
	nodesByURN: Map<string, SourceNavigationNode>;
	originalIdsByPath: Map<string, string>;
}

export type NavigationListScope = {
	source?: WrappedSource;
	category?: string;
	subcategory?: string;
	pathParts: string[];
}

export const {store: navigation} = await persist<NavigationState>(
	{
		activePath        : undefined,
		expandedPaths     : [],
		rootNodes         : [],
		nodesByPath       : new Map<string, SourceNavigationNode>(),
		nodesByURN        : new Map<string, SourceNavigationNode>(),
		originalIdsByPath : new Map<string, string>(),
	},
	"navigation",
);

export function buildNavigationTree(tree: SourceNavigationNode[]) {
	const nodesByPath = new Map<string, SourceNavigationNode>();
	const nodesByURN = new Map<string, SourceNavigationNode>();
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

	navigation.rootNodes = ref(tree);
	navigation.nodesByPath = ref(nodesByPath);
	navigation.nodesByURN = ref(nodesByURN);
	navigation.originalIdsByPath = ref(originalIdsByPath);
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
	const idx = navigation.expandedPaths.indexOf(path);
	if (idx >= 0) {
		navigation.expandedPaths.splice(idx, 1);
	} else {
		navigation.expandedPaths.push(path);
	}
}

export function isExpanded(path: string): boolean {
	return navigation.expandedPaths.includes(path);
}

export function getNavigationSource(path?: string): WrappedSource | undefined {
	const sourceKind = getNavigationNode(path)?.source;
	return sourceKind ? findSourceByType(sourceKind) : undefined;
}

export function getNavigationListScope(path?: string): NavigationListScope {
	const source = getNavigationSource(path);
	const pathParts = getOriginalPathParts(path);

	return {
		source,
		category: pathParts[0],
		subcategory: pathParts[1],
		pathParts,
	};
}

export function getDefaultNavigationPath(): string | undefined {
	return navigation.activePath ?? navigation.rootNodes[0]?.path;
}

function expandPathParents(path: string) {
	const parts = path.split("/");
	for (let i = 0; i < parts.length; i++) {
		const parentPath = parts.slice(0, i + 1).join("/");
		if (!navigation.expandedPaths.includes(parentPath)) {
			navigation.expandedPaths.push(parentPath);
		}
	}
}

function getOriginalPathParts(path?: string): string[] {
	if (!path) {
		return [];
	}

	const parts = path.split("/");
	const sourcePath = parts.shift();
	if (!sourcePath) {
		return [];
	}

	const ids: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		const partPath = parts.slice(0, i + 1).join("/");
		const id = navigation.originalIdsByPath.get(`${sourcePath}/${partPath}`);
		if (id !== undefined) {
			ids.push(id);
		}
	}

	return ids;
}
