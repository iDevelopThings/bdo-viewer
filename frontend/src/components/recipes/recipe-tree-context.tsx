import {useContext, createContext} from "react";
import type {DeepReadonly, MaybeReadonly} from "@/types.ts";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import type {RecipeTree, RecipeTreeNode, RecipeSelection} from "@bindings/bdo-viewer/internal/recipe";
import type {ItemMap} from "@/components/calc/craft-calculator-panel.tsx";

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

export function itemOf(items: RItems|ItemMap, itemUrn: string): DeepReadonly<ListSourceEntry> | undefined {
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
// enumerateAlts lists a node's real recipes: each cluster carries its actual
// variants (concrete slot-pick tuples) from the backend, so we map those to
// ingredient lists — never the cartesian product of options, which for
// non-independent slots is astronomically larger than the real recipe count.
export function enumerateAlts(node: RNode): Alt[] {
	const alts: Alt[] = [];
	node.clusters?.forEach((cl, ci) => {
		const slots = cl.slots ?? [];
		for (const variant of cl.variants ?? []) {
			if (!variant) {
				continue;
			}
			const picks  = [...variant];
			const inputs = picks.map((oi, si) => {
				const opt = slots[si]?.options?.[oi] ?? slots[si]?.options?.[0];
				return {item : opt?.item ?? "", count : opt?.count ?? 0};
			});
			alts.push({cluster : ci, slots : picks, type : cl.type, station : cl.station ?? "", inputs});
		}
	});
	return alts;
}

export function isSameSelection(a: Alt, sel: RNode["selected"]): boolean {
	if (!sel || a.cluster !== sel.cluster || a.slots.length !== (sel.slots?.length ?? 0)) {
		return false;
	}
	return a.slots.every((v, i) => v === sel.slots![i]);
}
