import {Item, NPC, Territory, WorldNode, WorldNodeKind} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {wrap} from "@/utils.tsx";

const KIND_LABEL: Record<number, string> = {
	[WorldNodeKind.WorldNodeKindNormal]       : "Node",
	[WorldNodeKind.WorldNodeKindVillage]      : "Village",
	[WorldNodeKind.WorldNodeKindCity]         : "City",
	[WorldNodeKind.WorldNodeKindGate]         : "Gateway",
	[WorldNodeKind.WorldNodeKindFarm]         : "Farming",
	[WorldNodeKind.WorldNodeKindTrade]        : "Camp",
	[WorldNodeKind.WorldNodeKindCollect]      : "Gathering",
	[WorldNodeKind.WorldNodeKindQuarry]       : "Mining",
	[WorldNodeKind.WorldNodeKindLogging]      : "Lumbering",
	[WorldNodeKind.WorldNodeKindDangerous]    : "Dangerous",
	[WorldNodeKind.WorldNodeKindFinance]      : "Investment Bank",
	[WorldNodeKind.WorldNodeKindFishTrap]     : "Fish Drying",
	[WorldNodeKind.WorldNodeKindMinorFinance] : "Investment",
	[WorldNodeKind.WorldNodeKindMonopolyFarm] : "Specialty",
	[WorldNodeKind.WorldNodeKindCraft]        : "Crafting",
	[WorldNodeKind.WorldNodeKindExcavation]   : "Excavation",
};

const KIND_COLOR: Record<number, [number, number, number]> = {
	0 : [232, 120, 42],
	1 : [235, 200, 80],
	2 : [235, 200, 80],
	3 : [120, 170, 235],
	5 : [110, 200, 120],
	9 : [200, 90, 90],
};

const sym = Symbol("WrappedWorldNode");

export type WrappedWorldNode = WorldNode & {
	/** World position (x, y, z) projected onto the (x, z) plane the map draws in. */
	mapPos: [number, number];
	kindLabel: string;
	color: [number, number, number];
	/** Contribution points to activate the node (0 for towns and sub-nodes that cost nothing). */
	cp: number;
	territoryName: string | undefined;

	/** Only kinds 0..15 have a node_<kind>.png; anything else falls back to a plain dot. */
	hasIcon: boolean;
	icon(hover?: boolean): string;

	/** False for the 7 dormant/unreleased records the loc tables have no name for (they come
	 *  through as "UnKnown"); the map hides them unless the debug overlay is on. */
	named: boolean;
	/** True when the manager is attached to this node itself rather than inherited from
	 *  managerNode — the nodes that own a manager, and the only ones to draw a marker for. */
	ownsManager: boolean;
	/** The node this one's manager belongs to: itself when it owns one, else its managerNode. */
	managerOwner(): WrappedWorldNode | undefined;
	/** The node manager you invest CP with, resolved through the owning node. */
	managerNpc(): NPC | undefined;
	/** A town's ruler/representative — always a direct ref, never inherited. */
	representativeNpc(): NPC | undefined;

	parent(): WrappedWorldNode | undefined;
	childNodes(): WrappedWorldNode[];
	/** Children carrying worker products — Mining, Gathering, Farming, … */
	productionChildren(): WrappedWorldNode[];
	linkedNodes(): WrappedWorldNode[];
	/** Items produced here: the node's own products plus its production children's, since a main
	 *  location only reaches products through those children. */
	productItems(): Item[];
	/** CP of the node plus every child — what activating the whole location costs. */
	totalCP(): number;
};

/** NodeGraph owns the loaded worldmap nodes and the indexes their wrappers resolve against
 *  (node urn, parent, item, territory). Built once per data load. */
export class NodeGraph {
	public readonly nodes: WrappedWorldNode[]            = [];
	public readonly byURN: Map<string, WrappedWorldNode> = new Map();

	private readonly parentByURN      = new Map<string, string>(); // sub-node urn -> main node urn
	private readonly productURNs      = new Map<string, string[]>(); // node urn -> its item urns
	private readonly managerURNs      = new Map<string, string>(); // node urn -> its manager npc urn
	private readonly itemsByURN       = new Map<string, Item>();
	private readonly npcsByURN        = new Map<string, NPC>();
	private readonly territoriesByURN = new Map<string, string>();

	public constructor(nodes: WorldNode[], items: Item[], territories: Territory[], npcs: NPC[] = []) {
		for (const t of territories) {
			this.territoriesByURN.set(t.urn, t.name);
		}
		for (const i of items) {
			this.itemsByURN.set(i.urn, i);
		}
		for (const n of npcs) {
			this.npcsByURN.set(n.urn, n);
		}
		for (const n of nodes) {
			this.productURNs.set(n.urn, n.products?.urns ?? []);
			if (n.manager) {
				this.managerURNs.set(n.urn, n.manager);
			}
			for (const c of n.children?.urns ?? []) {
				this.parentByURN.set(c, n.urn);
			}
		}
		for (const n of nodes) {
			const wrapped = this.wrapNode(n);
			this.nodes.push(wrapped);
			this.byURN.set(wrapped.urn, wrapped);
		}
	}

	public node(urn: string): WrappedWorldNode | undefined {
		return this.byURN.get(urn);
	}

	// wrap() assigns onto the node itself, so read the model's ref lists up front — a wrapper
	// member sharing a field's name would otherwise clobber the field it reads from.
	private wrapNode(node: WorldNode): WrappedWorldNode {
		const graph       = this;
		const productURNs = node.products?.urns ?? [];
		const childURNs   = node.children?.urns ?? [];
		const linkURNs    = node.links?.urns ?? [];
		const managerURN     = node.manager;
		const managerNodeURN = node.managerNode;
		const repURN         = node.townRepresentative;

		let items: Item[] | undefined;

		return wrap(node, sym, (n: WorldNode): Partial<WrappedWorldNode> => ({
			mapPos        : [n.position[0], n.position[2]] as [number, number],
			kindLabel     : KIND_LABEL[n.kind] ?? `Kind ${n.kind}`,
			color         : KIND_COLOR[n.kind] ?? [232, 120, 42] as [number, number, number],
			cp            : n.contribution ?? 0,
			territoryName : n.territory ? graph.territoriesByURN.get(n.territory) : undefined,

			hasIcon : n.kind >= 0 && n.kind <= 15,
			icon(hover: boolean = false): string {
				return `/nodes/node_${n.kind ?? 0}${hover ? "_h" : ""}.png`;
			},
			named       : !!n.name && n.name.toLowerCase() !== "unknown",
			ownsManager : !!managerURN,
			managerOwner() {
				return managerNodeURN ? graph.byURN.get(managerNodeURN) : graph.byURN.get(n.urn);
			},
			managerNpc() {
				// A manager sits on one node and covers its affiliates, which point back at it via
				// managerNode — so resolve through the owner rather than off this node.
				const owner = managerNodeURN ? graph.managerURNs.get(managerNodeURN) : managerURN;

				return owner ? graph.npcsByURN.get(owner) : undefined;
			},
			representativeNpc() {
				return repURN ? graph.npcsByURN.get(repURN) : undefined;
			},
			parent() {
				const p = graph.parentByURN.get(n.urn);
				return p ? graph.byURN.get(p) : undefined;
			},
			childNodes() {
				return graph.resolve(childURNs);
			},
			productionChildren() {
				return graph.resolve(childURNs).filter(c => c.productItems().length > 0);
			},
			linkedNodes() {
				return graph.resolve(linkURNs);
			},
			productItems() {
				if (!items) {
					const urns = new Set(productURNs);
					for (const c of graph.resolve(childURNs)) {
						for (const u of graph.productURNs.get(c.urn) ?? []) {
							urns.add(u);
						}
					}
					items = [...urns].flatMap(u => graph.itemsByURN.get(u) ?? []);
				}
				return items;
			},
			totalCP() {
				let total = n.contribution ?? 0;
				for (const c of graph.resolve(childURNs)) {
					total += c.cp;
				}
				return total;
			},
		})) as unknown as WrappedWorldNode;
	}

	// Wrapping runs in graph order, so a child/link ref can point at a node that isn't wrapped yet
	// — but callers only resolve after the constructor finishes, by which point every node is in.
	private resolve(urns: string[] | null | undefined): WrappedWorldNode[] {
		return (urns ?? []).flatMap(u => this.byURN.get(u) ?? []);
	}
}
