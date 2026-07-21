import {useSnapshot} from "valtio";
import {MapPin, X} from "lucide-react";
import {mapState} from "@/components/world-map/map-state.ts";
import type {WrappedWorldNode} from "@/components/world-map/world-node.ts";
import {ChipList, EntityChip} from "@/components/details/details-components.tsx";
import {cn} from "@/lib/utils.ts";
import type {MaybeReadonly} from "@/types.ts";
import type {NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {goToURN} from "@/state/panels.ts";
import {Button} from "@/components/ui/button.tsx";

function Field({label, value}: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-row items-baseline justify-between gap-3">
			<span className="text-xs text-fg-subtle">{label}</span>
			<span className="text-xs text-fg text-right">{value}</span>
		</div>
	);
}

function Section({title, children}: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 border-t border-surface-border pt-2">
			<span className="text-xs font-semibold text-fg-subtle">{title}</span>
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
						<span className="text-xs text-fg-muted">{g.kindLabel}</span>
						{g.cp > 0 && <span className="text-xs text-amber-300/80">{g.cp} CP</span>}
					</div>
					<div className="flex flex-row flex-wrap gap-1">
						{g.productItems().map(item => (
							<EntityChip key={item.urn} urn={item.urn} name={item.name ?? item.urn} grade={item.grade} />
						))}
					</div>
				</div>
			))}
		</Section>
	);
}

/** One NPC attached to the node: click the name to open them, the pin to fly to where they stand. */
function NpcRow({role, npc}: { role: string; npc: NPC }) {
	const pos = npc.spawns?.find(s => s.pos.length >= 3)?.pos;

	return (
		<div className="flex flex-row items-baseline justify-between gap-2">
			<span className="text-xs text-fg-subtle">{role}</span>
			<div className="flex min-w-0 flex-row items-center gap-1">
				<Button
					variant="plain"
					size="inline"
					onClick={() => goToURN(npc.urn, {title : npc.name})}
					className="truncate hover:underline"
					title={npc.title}
				>
					{npc.name}
				</Button>
				{pos && (
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={() => mapState.focusWorldPos(pos)}
						title={`Show ${npc.name} on the map`}
						className="size-5 text-fg-subtle"
					>
						<MapPin size={11} />
					</Button>
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
			{manager && owner && (
				<Field
					label="Managed from"
					value={(
						<Button
							variant="plain"
							size="inline"
							onClick={() => mapState.updateNode(owner, "select")}
							className="hover:underline"
						>
							{owner.name}
						</Button>
					)}
				/>
			)}
			{rep && <NpcRow role="Representative" npc={rep} />}
		</Section>
	);
}

function knowledgeLabel(urn: string): string {
	const key = urn.split(":").pop();
	return key ? `#${key}` : urn;
}

function NodeDetails({node}: { node: WrappedWorldNode }) {
	const [x, z]  = node.mapPos;
	const parent  = node.parent();
	const linked  = node.linkedNodes();
	const totalCP = node.totalCP();
	const knowledgeURNs = node.knowledge?.urns ?? [];

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col">
				<span className="text-sm font-semibold text-fg">{node.name}</span>
				<span className="text-xs text-fg-subtle">
					{node.kindLabel} · {node.main ? "Main node" : "Sub-node"} · #{node.key}
				</span>
			</div>

			<div className="flex flex-col gap-0.5">
				{node.territoryName && <Field label="Territory" value={node.territoryName} />}
				{parent && (
					<Field
						label="Location"
						value={(
							<Button
								variant="plain"
								size="inline"
								onClick={() => mapState.updateNode(parent, "select")}
								className="hover:underline"
							>
								{parent.name}
							</Button>
						)}
					/>
				)}
				{node.cp > 0 && <Field label="Contribution" value={`${node.cp} CP`} />}
				{node.main && totalCP > node.cp && <Field label="With sub-nodes" value={`${totalCP} CP`} />}
				{!!node.grindZone && <Field label="Grind zone" value={node.grindTier ? `Tier ${node.grindTier}` : "Yes"} />}
				<Field label="Connections" value={linked.length} />
				<Field label="Position" value={`${x.toFixed(0)}, ${z.toFixed(0)}`} />
			</div>

			<People node={node} />

			<Production node={node} />

			{knowledgeURNs.length > 0 && (
				<Section title={`Knowledge (${knowledgeURNs.length})`}>
					<ChipList
						items={knowledgeURNs.map(urn => ({urn, name : knowledgeLabel(urn)}))}
						onClick={(item, pinned) => goToURN(item.urn, {pinned})}
					/>
				</Section>
			)}

			{linked.length > 0 && (
				<Section title={`Connects to (${linked.length})`}>
					<div className="flex flex-row flex-wrap gap-1">
						{linked.map(l => (
							<Button
								key={l.urn}
								variant="chip"
								size="xs"
								onClick={() => mapState.updateNode(l, "select")}
								className="bg-surface-2/80 hover:bg-surface-3"
							>
								{l.name}
							</Button>
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
				"rounded-md border border-surface-border/70 bg-surface-1/95 shadow-lg"
			])}
		>
			<div className="flex flex-row items-center justify-between border-b border-surface-border px-2 py-1.5">
				<span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
					<MapPin size={13} /> {selected ? "Selected node" : hovered ? "Hovered node" : "Nodes"}
				</span>
				{selected && (
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={() => mapState.updateNode(null, "select")}
						title="Deselect"
						className="size-5"
					>
						<X size={12} />
					</Button>
				)}
			</div>
			<div className="overflow-y-auto p-2">
				{shown
					? <NodeDetails node={shown} />
					: <p className="text-xs text-fg-subtle">Hover or select a node on the map.</p>}
			</div>
		</div>
	);
}
