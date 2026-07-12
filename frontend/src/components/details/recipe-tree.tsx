import {createContext, useContext, useMemo, useState} from "react";
import {CheckIcon, ChevronRightIcon, Repeat2} from "lucide-react";
import {cn} from "@/lib/utils.ts";
import {RecipeSelection, RecipeTree, RecipeTreeNode} from "@bindings/bdo-viewer/internal/recipe";
import {RECIPE_TYPE_COLOR, recipeTypeLabel} from "@/lib/recipe-labels.ts";
import {type DeepReadonly, type Grade, grades} from "@/types.ts";
import {openItemPanel} from "@/state/panels.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog.tsx";

// This is the reusable crafting-tree renderer. It's driven entirely by the
// RecipeTree data the backend resolves (only the selected path is expanded; every
// node carries its alternatives as per-slot option metadata). Selection and
// expansion are injected via context so the same tree renders both in item detail
// (backed by the detail store + global expansion) and in the crafting calculator
// (backed by its own per-target selections + expansion) — see RecipeTreeView.

export type RItems = DeepReadonly<RecipeTree["items"]>;
type RNode = DeepReadonly<RecipeTreeNode>;

type RecipeTreeCtx = {
	onSelectRecipe: (path: string, selection: RecipeSelection) => void;
	// onToggleCraft flips a craftable node between crafted (expanded) and bought
	// (collapsed) — it re-resolves the tree, so `craft` is the new desired state.
	onToggleCraft: (path: string, craft: boolean) => void;
};

const RecipeTreeContext = createContext<RecipeTreeCtx | null>(null);

function useRecipeTree(): RecipeTreeCtx {
	const ctx = useContext(RecipeTreeContext);
	if (!ctx) {
		throw new Error("recipe tree components must be rendered inside <RecipeTreeView>");
	}
	return ctx;
}

export function itemOf(items: RItems, itemUrn: string): DeepReadonly<ListSourceEntry> | undefined {
	return (items as Record<string, DeepReadonly<ListSourceEntry> | null | undefined>)?.[itemUrn] ?? undefined;
}

// The recipe tree carries slim ListSourceEntry rows (see internal/recipe.itemEntry),
// so the grade lives in `subtitle` rather than a full item's `grade`.
export function gradeColor(item: DeepReadonly<ListSourceEntry> | undefined): string | undefined {
	const grade = item?.subtitle as Grade | undefined;
	return grade && grades[grade] ? grades[grade].color : undefined;
}

// Alt is one concrete way to craft a node — a specific recipe cluster and one
// option per ingredient slot, resolved to its ingredient list. The (cluster,
// slots) pair is exactly a RecipeSelection, so picking an Alt re-resolves the tree.
type Alt = {
	cluster: number;
	slots: number[];
	type: string;
	station: string;
	inputs: { item: string, count: number }[];
};

// enumerateAlts expands a node's clusters into every concrete recipe: within a
// cluster, the cartesian product of each slot's options. So the collapsed per-slot
// grid becomes a flat, readable list of "make it this exact way" choices.
function enumerateAlts(node: RNode): Alt[] {
	const alts: Alt[] = [];
	for (let ci = 0; ci < (node.clusters?.length ?? 0); ci++) {
		const cl    = node.clusters![ci];
		const slots = cl.slots ?? [];
		const picks = cartesian(slots.map(s => Math.max(1, s.options?.length ?? 1)));
		for (const pick of picks) {
			const inputs = slots.map((s, si) => {
				const opt = s.options?.[pick[si]] ?? s.options?.[0];
				return {item: opt?.item ?? "", count: opt?.count ?? 0};
			});
			alts.push({cluster: ci, slots: pick, type: cl.type, station: cl.station, inputs});
		}
	}
	return alts;
}

// cartesian returns every index combination for slots with the given option counts.
function cartesian(counts: number[]): number[][] {
	let result: number[][] = [[]];
	for (const n of counts) {
		const next: number[][] = [];
		for (const combo of result) {
			for (let i = 0; i < n; i++) {
				next.push([...combo, i]);
			}
		}
		result = next;
	}
	return result;
}

function isSameSelection(a: Alt, sel: RNode["selected"]): boolean {
	if (!sel || a.cluster !== sel.cluster || a.slots.length !== (sel.slots?.length ?? 0)) {
		return false;
	}
	return a.slots.every((v, i) => v === sel.slots![i]);
}

// NodeAltsButton renders nothing when a node has a single recipe; otherwise a
// compact "N ways" pill that opens a dialog listing every alternative (grouped by
// process) so the user can read and pick one — instead of the inline chip grid.
function NodeAltsButton({node, items, className}: { node: RNode, items: RItems, className?: string }) {
	const {onSelectRecipe} = useRecipeTree();
	const [open, setOpen]  = useState(false);
	const alts             = useMemo(() => enumerateAlts(node), [node]);

	if (alts.length <= 1) {
		return null;
	}

	const itemName = itemOf(items, node.item)?.title ?? node.item;

	return (
		<>
			<button
				type={"button"}
				data-testid={"node-alts"}
				data-path={node.path}
				onClick={e => {
					e.stopPropagation();
					setOpen(true);
				}}
				className={cn(
					"flex flex-row items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs shrink-0 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
					className,
				)}
			>
				<Repeat2 className={"size-3"} />
				{alts.length} ways
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className={"sm:max-w-xl"}>
					<DialogHeader>
						<DialogTitle>Choose a recipe for {itemName}</DialogTitle>
						<DialogDescription>{alts.length} ways to craft this — pick which one the tree uses.</DialogDescription>
					</DialogHeader>
					<div className={"flex flex-col gap-1 max-h-[60vh] overflow-auto -mx-1 px-1"}>
						{alts.map((alt, i) => {
							const current  = isSameSelection(alt, node.selected);
							const showHead = i === 0 || alts[i - 1].cluster !== alt.cluster;
							return (
								<div key={`${alt.cluster}:${alt.slots.join(",")}`} className={"flex flex-col"}>
									{showHead && (
										<div className={"text-xs font-semibold pt-2 pb-1"} style={{color: RECIPE_TYPE_COLOR}}>
											{recipeTypeLabel(alt.type, alt.station)}
										</div>
									)}
									<button
										type={"button"}
										data-testid={"recipe-alt"}
										data-current={current}
										onClick={() => {
											onSelectRecipe(node.path, {cluster: alt.cluster, slots: alt.slots});
											setOpen(false);
										}}
										className={cn(
											"flex flex-row flex-wrap gap-1.5 items-center rounded-md p-2 text-left hover:bg-zinc-800",
											current && "bg-zinc-800 ring-1 ring-primary/60",
										)}
									>
										{alt.inputs.map((inp, si) => {
											const it = itemOf(items, inp.item);
											return (
												<span key={`${inp.item}:${si}`} className={"flex flex-row items-center gap-1 bg-zinc-700/50 rounded px-1.5 py-0.5"}>
													<ItemIcon urn={inp.item} className={"shrink-0"} imageClass={"w-4 h-4"} />
													<span className={"text-sm"} style={{color: gradeColor(it)}}>{it?.title ?? inp.item}</span>
													<span className={"text-xs text-zinc-400"}>×{inp.count}</span>
												</span>
											);
										})}
										{current && <CheckIcon className={"size-4 text-primary ml-auto shrink-0"} />}
									</button>
								</div>
							);
						})}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

// RecipeTreeView renders a resolved craft tree's root node, providing the
// selection/expansion context its rows read. Callers supply onSelectRecipe (which
// should re-resolve the tree with the updated selections) and expansion state.
export function RecipeTreeView({root, items, onSelectRecipe, onToggleCraft}: {
	root: RNode;
	items: RItems;
	onSelectRecipe: (path: string, selection: RecipeSelection) => void;
	onToggleCraft: (path: string, craft: boolean) => void;
}) {
	return (
		<RecipeTreeContext.Provider value={{onSelectRecipe, onToggleCraft}}>
			<RecipeBody node={root} items={items} depth={0} isRoot />
		</RecipeTreeContext.Provider>
	);
}

// RecipeBody renders how a node is crafted: an optional cluster (recipe-family)
// switch, the per-slot alternative chips for the selected cluster, and the resolved
// ingredient rows. Used both for the root and (on expand) any craftable child.
export function RecipeBody({node, items, depth, isRoot}: { node: RNode, items: RItems, depth: number, isRoot?: boolean }) {
	const sel      = node.selected;
	const clusters = node.clusters ?? [];
	if (!sel || clusters.length === 0) {
		return null;
	}
	const cluster = clusters[sel.cluster] ?? clusters[0];

	return (
		<div className={"flex flex-col gap-2"}>
			{isRoot && (
				<div className={"flex flex-row items-center gap-2"}>
					<span className={"text-sm text-zinc-400 font-bold"}>{recipeTypeLabel(cluster.type, cluster.station)}</span>
					<NodeAltsButton node={node} items={items} />
				</div>
			)}
			<div className={"flex flex-col"}>
				{node.children?.map(child => (
					<RecipeRow key={child!.path} node={child!} items={items} depth={depth} />
				))}
			</div>
		</div>
	);
}

// RecipeRow is one ingredient in the tree. A craftable ingredient carries a
// craft/buy toggle: crafted (chevron open) shows its own recipe + children;
// bought (chevron closed) is a shopping-list leaf. Toggling re-resolves the tree.
function RecipeRow({node, items, depth}: { node: RNode, items: RItems, depth: number }) {
	const {onToggleCraft} = useRecipeTree();
	const item      = itemOf(items, node.item);
	const craftable = !!node.craftable && !node.gathered;
	const crafted   = !!node.children?.length;
	const color     = gradeColor(item);
	const cluster   = crafted ? (node.clusters![node.selected?.cluster ?? 0] ?? node.clusters![0]) : undefined;

	return (
		<div className={"flex flex-col"}>
			<div
				data-testid={"recipe-node"}
				data-urn={node.item}
				data-path={node.path}
				data-craftable={craftable}
				data-crafted={crafted}
				className={"flex flex-row gap-1.5 items-center py-1 px-2 rounded-sm hover:bg-zinc-700/40 cursor-pointer"}
				style={{paddingLeft: `${8 + depth * 16}px`}}
				onClick={() => craftable ? onToggleCraft(node.path, !crafted) : (item && openItemPanel({id: item.id, name: item.title}, false))}
				onMouseDown={e => {
					if (e.button === 1) {
						e.preventDefault();
					}
				}}
				onAuxClick={e => {
					if (e.button === 1 && item) {
						openItemPanel({id: item.id, name: item.title}, true);
					}
				}}
			>
				{craftable ? (
					<ChevronRightIcon
						className={cn(
							"size-3.5 shrink-0 text-zinc-500 transition-transform duration-150",
							crafted && "rotate-90",
						)}
					/>
				) : (
					<span className={"size-3.5 shrink-0"} />
				)}
				<ItemIcon urn={node.item} className={"shrink-0"} imageClass={"w-5 h-5"} />
				<span className={"text-sm min-w-0 truncate"} style={color ? {color} : undefined}>{item?.title}</span>
				{!!node.count && <span className={"text-sm text-zinc-500 shrink-0"}>×{node.count}</span>}
				{node.gathered ? (
					<span className={"text-sm shrink-0"} style={{color: grades.green.color}}>gathered</span>
				) : node.cycle ? (
					<span className={"text-sm text-zinc-500 shrink-0"}>…</span>
				) : crafted && cluster ? (
					<span className={"text-sm shrink-0"} style={{color: RECIPE_TYPE_COLOR}}>
						{recipeTypeLabel(cluster.type, cluster.station)}
					</span>
				) : craftable ? (
					<span className={"text-xs shrink-0 text-zinc-500"}>buy · craftable</span>
				) : null}
				{crafted && <NodeAltsButton node={node} items={items} className={"ml-auto"} />}
			</div>
			{crafted && (
				<RecipeBody node={node} items={items} depth={depth + 1} />
			)}
		</div>
	);
}
