import {useContext, createContext} from "react";
import type {DeepReadonly, MaybeReadonly} from "@/types.ts";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {RecipeTree, RecipeTreeNode, RecipeSelection} from "@bindings/bdo-viewer/internal/recipe";

export type RItems = MaybeReadonly<RecipeTree["items"]>;
export type RNode = MaybeReadonly<RecipeTreeNode>;

type RecipeTreeCtx = {
	onSelectRecipe: (path: string, selection: RecipeSelection) => void;
	// onToggleCraft flips a craftable node between crafted (expanded) and bought
	// (collapsed) — it re-resolves the tree, so `craft` is the new desired state.
	onToggleCraft: (path: string, craft: boolean) => void;
	// Visible (depth-first) row index for a node path, so rows can alternate
	// background regardless of nesting.
	orderOf: (path: string) => number;
};
export const RecipeTreeContext = createContext<RecipeTreeCtx | null>(null);

export function useRecipeTree(): RecipeTreeCtx {
	const ctx = useContext(RecipeTreeContext);
	if (!ctx) {
		throw new Error("recipe tree components must be rendered inside <RecipeTreeView>");
	}
	return ctx;
}

export function itemOf(items: RItems, itemUrn: string): DeepReadonly<ListSourceEntry> | undefined {
	return items?.[itemUrn] ?? undefined;
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
export function enumerateAlts(node: RNode): Alt[] {
	const alts: Alt[] = [];
	for (let ci = 0; ci < (node.clusters?.length ?? 0); ci++) {
		const cl    = node.clusters![ci];
		const slots = cl.slots ?? [];
		const picks = cartesian(slots.map(s => Math.max(1, s.options?.length ?? 1)));
		for (const pick of picks) {
			const inputs = slots.map((s, si) => {
				const opt = s.options?.[pick[si]] ?? s.options?.[0];
				return {item : opt?.item ?? "", count : opt?.count ?? 0};
			});
			alts.push({cluster : ci, slots : pick, type : cl.type, station : cl.station, inputs});
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

export function isSameSelection(a: Alt, sel: RNode["selected"]): boolean {
	if (!sel || a.cluster !== sel.cluster || a.slots.length !== (sel.slots?.length ?? 0)) {
		return false;
	}
	return a.slots.every((v, i) => v === sel.slots![i]);
}
