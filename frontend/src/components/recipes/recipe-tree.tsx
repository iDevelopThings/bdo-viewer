import {useCallback, useMemo, useState} from "react";
import {CheckIcon, ChevronRightIcon, Repeat2} from "lucide-react";
import {cn} from "@/lib/utils.ts";
import type {RecipeSelection} from "@bindings/bdo-viewer/internal/recipe";
import {RECIPE_TYPE_COLOR, recipeTypeLabel} from "@/lib/recipe-labels.ts";
import {EntryIcon} from "@/lib/entry-icon.tsx";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog.tsx";
import {tryGetGradeColor, ItemGradeInfos, ItemGrades} from "@/lib/types/item-grades.ts";
import {RecipeTreeContext, type RNode, type RItems, itemOf, useRecipeTree, enumerateAlts, isSameSelection} from "@/components/recipes/recipe-tree-context.tsx";

// This is the reusable crafting-tree renderer. It's driven entirely by the
// RecipeTree data the backend resolves (only the selected path is expanded; every
// node carries its alternatives as per-slot option metadata). Selection and
// expansion are injected via context so the same tree renders both in item detail
// (backed by the detail store + global expansion) and in the crafting calculator
// (backed by its own per-target selections + expansion) — see RecipeTreeView.

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
					"flex flex-row items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs shrink-0 bg-surface-2 text-fg-muted hover:bg-surface-3",
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
										<div className={"text-xs font-semibold pt-2 pb-1"} style={{color : RECIPE_TYPE_COLOR}}>
											{recipeTypeLabel(alt.type, alt.station)}
										</div>
									)}
									<button
										type={"button"}
										data-testid={"recipe-alt"}
										data-current={current}
										onClick={() => {
											onSelectRecipe(node.path, {cluster : alt.cluster, slots : alt.slots});
											setOpen(false);
										}}
										className={cn(
											"flex flex-row flex-wrap gap-1.5 items-center rounded-md p-2 text-left hover:bg-surface-2",
											current && "bg-surface-2 ring-1 ring-primary/60",
										)}
									>
										{alt.inputs.map((inp, si) => {
											const it = itemOf(items, inp.item);
											return (
												<span key={`${inp.item}:${si}`} className={"flex flex-row items-center gap-1 bg-surface-3/50 rounded px-1.5 py-0.5"}>
													<EntryIcon urn={inp.item} className={"shrink-0"} imageClass={"w-4 h-4"} />
													<span className={"text-sm"} style={{color : tryGetGradeColor(it?.extra?.grade)?.toString()}}>{it?.title ?? inp.item}</span>
													{!!inp.count && <span className={"text-xs text-fg-subtle"}>×{inp.count}</span>}
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
// Indent per tree level, and the x of the guide rail at a given level (roughly the
// chevron centre of the parent at that level).
const INDENT = 16;
const RAIL_X = (level: number) => 8 + level * INDENT + 7;

export function RecipeTreeView({root, items, onSelectRecipe, onToggleCraft}: {
	root: RNode;
	items: RItems;
	onSelectRecipe: (path: string, selection: RecipeSelection) => void;
	onToggleCraft: (path: string, craft: boolean) => void;
}) {
	// Depth-first visible order, matching how RecipeBody renders, so rows can stripe.
	const orderMap = useMemo(() => {
		const m = new Map<string, number>();
		let i = 0;
		const walk = (node: RNode) => {
			for (const child of node.children ?? []) {
				if (!child) continue;
				m.set(child.path, i++);
				if (child.children?.length) walk(child);
			}
		};
		walk(root);
		return m;
	}, [root]);
	const orderOf = useCallback((path: string) => orderMap.get(path) ?? 0, [orderMap]);

	return (
		<RecipeTreeContext.Provider value={{onSelectRecipe, onToggleCraft, orderOf}}>
			<RecipeBody node={root} items={items} depth={0} prefix={[]} isRoot />
		</RecipeTreeContext.Provider>
	);
}

// RecipeBody renders how a node is crafted: an optional cluster (recipe-family)
// switch, the per-slot alternative chips for the selected cluster, and the resolved
// ingredient rows. Used both for the root and (on expand) any craftable child.
export function RecipeBody({node, items, depth, prefix = [], isRoot}: { node: RNode, items: RItems, depth: number, prefix?: boolean[], isRoot?: boolean }) {
	const sel      = node.selected;
	const clusters = node.clusters ?? [];
	if (!sel || clusters.length === 0) {
		return null;
	}
	const cluster  = clusters[sel.cluster] ?? clusters[0];
	const children = node.children ?? [];

	return (
		<div className={"flex flex-col gap-2"}>
			{isRoot && (
				<div className={"flex flex-row items-center gap-2"}>
					<span className={"text-sm text-fg-subtle font-bold"}>{recipeTypeLabel(cluster.type, cluster.station)}</span>
					<NodeAltsButton node={node} items={items} />
				</div>
			)}
			<div className={"flex flex-col"}>
				{children.map((child, i) => (
					<RecipeRow key={child!.path} node={child!} items={items} depth={depth} prefix={prefix} isLast={i === children.length - 1} />
				))}
			</div>
		</div>
	);
}

// RecipeRow is one ingredient in the tree. A craftable ingredient carries a
// craft/buy toggle: crafted (chevron open) shows its own recipe + children;
// bought (chevron closed) is a shopping-list leaf. Toggling re-resolves the tree.
function RecipeRow({node, items, depth, prefix, isLast}: { node: RNode, items: RItems, depth: number, prefix: boolean[], isLast: boolean }) {
	const {onToggleCraft, orderOf} = useRecipeTree();
	const item            = itemOf(items, node.item);
	const craftable       = !!node.craftable && !node.gathered;
	const crafted         = !!node.children?.length;
	const color           = tryGetGradeColor(item?.extra?.grade)?.toString();
	const cluster         = crafted ? (node.clusters![node.selected?.cluster ?? 0] ?? node.clusters![0]) : undefined;
	const stripe          = orderOf(node.path) % 2 === 1 ? "bg-fg/[0.03]" : "";

	return (
		<div className={"flex flex-col"}>
			<div
				data-testid={"recipe-node"}
				data-urn={node.item}
				data-path={node.path}
				data-craftable={craftable}
				data-crafted={crafted}
				className={cn("relative flex flex-row gap-1.5 items-center py-1 pr-2 rounded-sm", craftable && "cursor-pointer", stripe, "hover:bg-surface-3/40")}
				style={{paddingLeft : `${8 + depth * INDENT}px`}}
				onClick={e => {
					// The alts dialog is portaled to <body> but is a React descendant of this row, so
					// its clicks bubble here through the portal — ignore anything not physically inside.
					if (!e.currentTarget.contains(e.target as Node)) {
						return;
					}
					if (craftable) {
						onToggleCraft(node.path, !crafted);
					}
				}}
			>
				{/* tree guide rails: continuing verticals for ancestors, a ├/└ connector for this row */}
				{depth > 0 && (
					<>
						{prefix.slice(0, depth - 1).map((cont, i) =>
							cont ? <span key={i} className={"absolute top-0 bottom-0 w-px bg-surface-border"} style={{left : RAIL_X(i)}} /> : null,
						)}
						<span className={"absolute w-px bg-surface-border"} style={{left : RAIL_X(depth - 1), top : 0, height : "50%"}} />
						{!isLast && <span className={"absolute w-px bg-surface-border"} style={{left : RAIL_X(depth - 1), top : "50%", bottom : 0}} />}
						<span className={"absolute h-px bg-surface-border"} style={{left : RAIL_X(depth - 1), top : "50%", width : INDENT - 7}} />
					</>
				)}
				{craftable ? (
					<ChevronRightIcon
						className={cn(
							"size-3.5 shrink-0 text-fg-subtle transition-transform duration-150",
							crafted && "rotate-90",
						)}
					/>
				) : (
					<span className={"size-3.5 shrink-0"} />
				)}
				<EntryIcon urn={node.item} title={item?.title} clickable className={"shrink-0"} imageClass={"w-5 h-5"} />
				<span className={"text-sm min-w-0 truncate"} style={color ? {color} : undefined}>{item?.title}</span>
				{!!node.count && <span className={"text-sm text-fg-subtle shrink-0"}>×{node.count}</span>}
				{node.gathered ? (
					<span className={"text-sm shrink-0"} style={{color : ItemGradeInfos[ItemGrades.Green].color}}>gathered</span>
				) : node.cycle ? (
					<span className={"text-sm text-fg-subtle shrink-0"}>…</span>
				) : crafted && cluster ? (
					<span className={"text-sm shrink-0"} style={{color : RECIPE_TYPE_COLOR}}>
						{recipeTypeLabel(cluster.type, cluster.station)}
					</span>
				) : craftable ? (
					<span className={"text-xs shrink-0 text-fg-subtle"}>buy · craftable</span>
				) : null}
				{crafted && <NodeAltsButton node={node} items={items} className={"ml-auto"} />}
			</div>
			{crafted && (
				<RecipeBody node={node} items={items} depth={depth + 1} prefix={[...prefix, !isLast]} />
			)}
		</div>
	);
}
