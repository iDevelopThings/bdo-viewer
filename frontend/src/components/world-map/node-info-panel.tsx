import {useSnapshot} from "valtio";
import {MapPin, X} from "lucide-react";
import {mapState} from "@/components/world-map/map-state.ts";
import {WrappedWorldNode} from "@/components/world-map/world-node.ts";
import {ItemCardSimple} from "@/components/details/details-components.tsx";
import {cn} from "@/lib/utils.ts";
import {MaybeReadonly} from "@/types.ts";
import {NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {openSourceDetails} from "@/state/panels.ts";

function Field({label, value}: { label: string; value: string | number }) {
	return (
		<div className="flex flex-row items-baseline justify-between gap-3">
			<span className="text-xs text-zinc-400">{label}</span>
			<span className="text-xs text-zinc-200 text-right">{value}</span>
		</div>
	);
}

function Section({title, children}: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-2">
			<span className="text-xs font-semibold text-zinc-400">{title}</span>
			{children}
		</div>
	);
}

/** The nodes a location produces at, each with the items its workers can gather there. A
 *  sub-node stands in for itself so both cases render the same way. */
function Production({node}: { node: WrappedWorldNode }) {
	const groups = node.productionChildren().length ? node.productionChildren() : (node.productItems().length ? [node] : []);
	if (!groups.length) {
		return null;
	}

	const count = node.productItems().length;

	return (
		<Section title={`Production (${count} ${count === 1 ? "item" : "items"})`}>
			{groups.map(g => (
				<div key={g.urn} className="flex flex-col gap-1">
					<div className="flex flex-row items-center justify-between">
						<span className="text-xs text-zinc-300">{g.kindLabel}</span>
						{g.cp > 0 && <span className="text-xs text-amber-300/80">{g.cp} CP</span>}
					</div>
					<div className="flex flex-row flex-wrap gap-1">
						{g.productItems().map(item => (
							<ItemCardSimple key={item.urn} item={item} />
						))}
					</div>
				</div>
			))}
		</Section>
	);
}

/** One NPC attached to the node: click the name to open them, the pin to fly to where they stand. */
function NpcRow({role, npc}: { role: string; npc: NPC }) {
	const pos = npc.spawns?.find(s => s.pos?.length >= 3)?.pos;

	return (
		<div className="flex flex-row items-baseline justify-between gap-2">
			<span className="text-xs text-zinc-400">{role}</span>
			<div className="flex min-w-0 flex-row items-center gap-1">
				<button
					onClick={() => openSourceDetails(SourceKind.Npc, {id : npc.id, name : npc.name, urn : npc.urn})}
					className="truncate text-xs text-zinc-200 hover:text-zinc-50 hover:underline"
					title={npc.title}
				>
					{npc.name}
				</button>
				{pos && (
					<button
						onClick={() => mapState.focusWorldPos(pos)}
						title={`Show ${npc.name} on the map`}
						className="text-zinc-500 hover:text-zinc-200"
					>
						<MapPin size={11} />
					</button>
				)}
			</div>
		</div>
	);
}

/** The node's NPCs: its manager (who you invest CP with) and, for towns, the representative. An
 *  affiliated node shares the manager of the node that owns them, so name that node too. */
function People({node}: { node: WrappedWorldNode }) {
	const manager = node.managerNpc();
	const rep     = node.representativeNpc();
	if (!manager && !rep) {
		return null;
	}

	const owner = node.ownsManager ? undefined : node.managerOwner();

	return (
		<Section title="NPCs">
			{manager && <NpcRow role="Node manager" npc={manager} />}
			{manager && owner && <Field label="Managed from" value={owner.name} />}
			{rep && <NpcRow role="Representative" npc={rep} />}
		</Section>
	);
}

function NodeDetails({node}: { node: WrappedWorldNode }) {
	const [x, z]  = node.mapPos;
	const parent  = node.parent();
	const linked  = node.linkedNodes();
	const totalCP = node.totalCP();

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col">
				<span className="text-sm font-semibold text-zinc-100">{node.name}</span>
				<span className="text-xs text-zinc-500">
					{node.kindLabel} · {node.main ? "Main node" : "Sub-node"} · #{node.key}
				</span>
			</div>

			<div className="flex flex-col gap-0.5">
				{node.territoryName && <Field label="Territory" value={node.territoryName} />}
				{parent && <Field label="Location" value={parent.name} />}
				{node.cp > 0 && <Field label="Contribution" value={`${node.cp} CP`} />}
				{node.main && totalCP > node.cp && <Field label="With sub-nodes" value={`${totalCP} CP`} />}
				{!!node.grindZone && <Field label="Grind zone" value={node.grindTier ? `Tier ${node.grindTier}` : "Yes"} />}
				{!!node.knowledge?.urns?.length && <Field label="Knowledge" value={node.knowledge.urns.length} />}
				<Field label="Connections" value={linked.length} />
				<Field label="Position" value={`${x.toFixed(0)}, ${z.toFixed(0)}`} />
			</div>

			<People node={node} />

			<Production node={node} />

			{linked.length > 0 && (
				<Section title={`Connects to (${linked.length})`}>
					<div className="flex flex-row flex-wrap gap-1">
						{linked.map(l => (
							<button
								key={l.urn}
								onClick={() => mapState.updateNode(l, "select")}
								className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
							>
								{l.name}
							</button>
						))}
					</div>
				</Section>
			)}
		</div>
	);
}

/** Left-hand map panel: the selected node's detail, falling back to whatever is hovered so the
 *  map can be scanned without clicking. */
export function NodeInfoPanel() {
	const map = useSnapshot(mapState);

	// Snapshots strip nothing off a ref()'d node, but the type widens to readonly — the wrapper's
	// methods still close over the live node, so cast back.
	const selected = map.selectedNode as MaybeReadonly<WrappedWorldNode> | null;
	const hovered  = map.hoveredNode as MaybeReadonly<WrappedWorldNode> | null;
	const shown    = (selected ?? hovered) as WrappedWorldNode | null;

	return (
		<div
			className={cn([
				"absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden",
				"rounded-md border border-zinc-700/70 bg-zinc-900/95 shadow-lg"
			])}
		>
			<div className="flex flex-row items-center justify-between border-b border-zinc-800 px-2 py-1.5">
				<span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
					<MapPin size={13} /> {selected ? "Selected node" : hovered ? "Hovered node" : "Nodes"}
				</span>
				{selected && (
					<button
						onClick={() => mapState.updateNode(null, "select")}
						title="Clear selection"
						className="text-zinc-400 hover:text-zinc-100"
					>
						<X size={14} />
					</button>
				)}
			</div>

			<div className="overflow-y-auto overflow-x-hidden p-2">
				{shown ? (
					<NodeDetails node={shown} />
				) : (
					 <p className="text-xs text-zinc-400">
						 Hover a node to preview it, click to pin it here.
						 <span className="mt-1 block text-zinc-500">{map.nodes.length} nodes · {map.links.length} links</span>
					 </p>
				 )}
			</div>
		</div>
	);
}
