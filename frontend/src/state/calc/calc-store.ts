import {proxy} from "valtio";
import {proxyMap} from "valtio/utils";
import {persist} from "valtio-persist";
import type {RecipeSelection, CraftPlan, Requirement} from "@bindings/bdo-viewer/internal/recipe";
import {BillOfMaterials, ResolveCraftPlan} from "@bindings/bdo-viewer/internal/recipe/resolver.ts";
import {fetchMarket, marketLoaded} from "@/lib/market-data.tsx";

// The crafting calculator state. A craft list of target items (each with a
// quantity and its own per-node recipe selections) is combined into one shopping
// list. The resolved trees + rolled-up bill of materials are derived on the Go
// side (recipe.ResolveCraftPlan / BillOfMaterials, mastery-yield-scaled), so this
// store only persists the inputs and caches the last computed results.

export type CalcTarget = {
	urn: string;
	qty: number;
	// selections keyed by RecipeTreeNode.Path — the alternate recipe/ingredient
	// picks for this target's tree (scoped to it, so they don't affect other trees).
	selections: Record<string, RecipeSelection>;
	// craftOverrides keyed by node Path — force a node to craft (true) or buy
	// (false), overriding the economic default (the tree's craft/buy toggle).
	craftOverrides: Record<string, boolean>;
};

export type CalcState = {
	targets: CalcTarget[];
};

export const {store: calc} = await persist<CalcState>({
	targets: [],
}, "calc");

// calcRuntime holds the derived, non-persisted results: the resolved plan per
// target (for the trees) and the combined bill of materials (for the shopping
// list).
export const calcRuntime = proxy<{
	plans: Map<string, CraftPlan>;
	bom: Requirement[];
	loading: boolean;
}>({
	plans   : proxyMap<string, CraftPlan>(),
	bom     : [],
	loading : false,
});

let recomputeSeq = 0;

// recompute resolves every target's craft plan and the combined bill of materials.
// Concurrent calls are guarded by a sequence so only the latest result is applied.
export async function recompute() {
	const seq = ++recomputeSeq;
	calcRuntime.loading = true;

	// The Go resolver's buy-vs-craft decision needs live prices; load them on the
	// first calculation so the tree/shopping list reflect real economics.
	if (!marketLoaded()) {
		await fetchMarket();
	}
	if (seq !== recomputeSeq) {
		return;
	}

	const targets = calc.targets.map(t => ({item: t.urn, qty: t.qty, selections: t.selections, craftOverrides: t.craftOverrides}));

	try {
		const [plans, bom] = await Promise.all([
			Promise.all(calc.targets.map(t => ResolveCraftPlan(t.urn, t.qty, t.selections, t.craftOverrides))),
			BillOfMaterials(targets),
		]);
		if (seq !== recomputeSeq) {
			return; // a newer recompute superseded this one
		}
		const map = proxyMap<string, CraftPlan>();
		calc.targets.forEach((t, i) => map.set(t.urn, plans[i]));
		calcRuntime.plans = map;
		calcRuntime.bom   = bom ?? [];
	} catch (error) {
		if (seq === recomputeSeq) {
			console.error("calc: recompute failed", error);
		}
	} finally {
		if (seq === recomputeSeq) {
			calcRuntime.loading = false;
		}
	}
}

export function addTarget(urn: string) {
	if (calc.targets.some(t => t.urn === urn)) {
		return;
	}
	calc.targets.push({urn, qty: 1, selections: {}, craftOverrides: {}});
	void recompute();
}

export function removeTarget(urn: string) {
	calc.targets = calc.targets.filter(t => t.urn !== urn);
	void recompute();
}

export function setQty(urn: string, qty: number) {
	const t = calc.targets.find(t => t.urn === urn);
	if (!t) {
		return;
	}
	t.qty = Math.max(1, Math.floor(qty) || 1);
	void recompute();
}

export function selectRecipe(urn: string, path: string, selection: RecipeSelection) {
	const t = calc.targets.find(t => t.urn === urn);
	if (!t) {
		return;
	}
	t.selections = {...t.selections, [path]: selection};
	void recompute();
}

// toggleCraft forces a node (by path) to craft or buy, then re-resolves — the
// tree's craft/buy toggle. It overrides the economic default for that node.
export function toggleCraft(urn: string, path: string, craft: boolean) {
	const t = calc.targets.find(t => t.urn === urn);
	if (!t) {
		return;
	}
	t.craftOverrides = {...t.craftOverrides, [path]: craft};
	void recompute();
}
