import {useEffect, useMemo, useState} from "react";
import {useSnapshot} from "valtio/react";
import {Plus, X} from "lucide-react";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {Requirement} from "@bindings/bdo-viewer/internal/recipe";
import {addTarget, calc, type CalcTarget, calcRuntime, recompute, removeTarget, selectRecipe, setQty, toggleCraft} from "@/state/calc/calc-store.ts";
import {RecipeTreeView} from "@/components/recipes/recipe-tree.tsx";
import {EntryPicker} from "@/components/entry-list/entry-picker.tsx";
import {fetchMarket, market, marketLoaded, marketStatus} from "@/lib/market-data.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Input} from "@/components/ui/input.tsx";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {moneyLabel} from "@/utils.tsx";
import {openItemPanel} from "@/state/panels.ts";
import type {DeepReadonly} from "@/types.ts";
import {tryGetGradeColor} from "@/lib/types/item-grades.ts";
import {itemOf} from "@/components/recipes/recipe-tree-context.tsx";

// CraftCalculatorPanel: a craft list of target items, each shown as a self-
// contained block — title + quantity, its (mastery-yield-scaled) recipe tree, and
// the base materials just that target needs. A combined shopping list at the
// bottom rolls every target's materials into one priced total.

type ItemMap = Record<string, ListSourceEntry | null | undefined>;

export function CraftCalculatorPanel() {
	const {targets}             = useSnapshot(calc);
	const {plans, bom}          = useSnapshot(calcRuntime);
	const {loading}             = useSnapshot(market);
	const [picking, setPicking] = useState(false);

	// Recompute on mount so a mastery change made in Settings is reflected.
	useEffect(() => {
		void recompute();
	}, []);

	// Merge every target plan's item map — covers the craft-list roots and every
	// base material (they all appear as nodes in some plan's tree). Read from the snapshot
	// and key on plans so it fills in once the async recompute populates them.
	const items: ItemMap = useMemo(() => {
		const m: ItemMap = {};
		for (const plan of plans.values()) {
			for (const [urn, it] of Object.entries(plan.tree.items ?? {})) {
				if (it) m[urn] = it as ListSourceEntry;
			}
		}
		return m;
	}, [plans]);

	return (
		<div className={"relative flex flex-col h-full max-h-full overflow-hidden"} data-panel={"calc"}>
			<div className={"flex flex-row items-center gap-2 p-2 border-b border-surface-border"}>
				<span className={"font-semibold text-sm flex-1"}>Crafting Calculator</span>
				{marketLoaded() ? (
					<span className={"text-xs text-fg-subtle"}>{marketStatus()}</span>
				) : (
					<Button size={"sm"} variant={"outline"} disabled={loading} onClick={() => void fetchMarket()}>
						{loading ? "Loading…" : "Load Prices"}
					</Button>
				)}
				<Button size={"sm"} onClick={() => setPicking(true)}>
					<Plus /> Add item
				</Button>
			</div>

			<div className={"flex-1 overflow-auto flex flex-col"}>
				{targets.length === 0 ? (
					<div className={"p-6 text-sm text-fg-subtle"}>
						Add items to combine their recipes into one shopping list.
					</div>
				) : (
					<>
						{targets.map(t => (
							<TargetBlock key={t.urn} target={t} items={items} />
						))}
						{targets.length > 1 && (
							<div className={"flex flex-col gap-2 p-3 bg-surface-1/40"}>
								<MaterialsList title={`Combined Shopping List (${bom.length})`} base={bom} items={items} strong />
							</div>
						)}
					</>
				)}
			</div>

			{picking && (
				<EntryPicker
					title={"Add item to craft"}
					fields={["grade", "effect"]}
					baseFilters={{craftable : true}}
					onPick={entry => {
						addTarget(entry.urn);
						setPicking(false);
					}}
					onClose={() => setPicking(false)}
				/>
			)}
		</div>
	);
}

// TargetBlock is one craft-list entry, rendered as a self-contained unit:
// title + quantity, the recipe tree (process + "N ways" + ingredients), then the
// base materials for just this target.
function TargetBlock({target, items}: { target: DeepReadonly<CalcTarget>, items: ItemMap }) {
	const {plans} = useSnapshot(calcRuntime);
	const plan    = plans.get(target.urn);
	const item    = itemOf(items, target.urn);

	return (
		<div
			className={"flex flex-col gap-3 p-3 border-b-4 border-surface-border/80"}
			data-testid={"craft-target"}
			data-urn={target.urn}
		>
			<div className={"flex flex-row items-center gap-2"}>
				<ItemIcon urn={target.urn} className={"shrink-0"} imageClass={"w-6 h-6"} />
				<span
					className={"flex-1 min-w-0 truncate text-sm font-semibold cursor-pointer hover:underline"}
					style={{color : tryGetGradeColor(item?.extra?.grade)?.toString()}}
					onClick={() => item && openItemPanel({id : item.id, name : item.title}, false)}
				>
					{item?.title ?? target.urn}
				</span>
				<Input
					type={"number"}
					min={1}
					value={target.qty}
					onChange={e => setQty(target.urn, parseInt(e.target.value, 10) || 1)}
					className={"w-20 h-8"}
				/>
				<Button variant={"ghost"} size={"icon-xs"} onClick={() => removeTarget(target.urn)}>
					<X />
				</Button>
			</div>

			{plan?.tree?.root && (
				<RecipeTreeView
					root={plan.tree.root}
					items={plan.tree.items ?? {}}
					onSelectRecipe={(path, sel) => selectRecipe(target.urn, path, sel)}
					onToggleCraft={(path, craft) => toggleCraft(target.urn, path, craft)}
				/>
			)}

			{plan?.base && plan.base.length > 0 && (
				<MaterialsList title={"Materials"} base={plan.base} items={items} />
			)}
		</div>
	);
}

// MaterialsList renders base-material rows with per-item and total market cost.
function MaterialsList({title, base, items, strong}: {
	title: string,
	base: DeepReadonly<Requirement[]>,
	items: ItemMap,
	strong?: boolean,
}) {

	const marketSnap = useSnapshot(market);

	const priced = base.map(req => {
		const entry = marketSnap.byURN.get(req.item);
		return {req, cost : entry ? entry.price * req.count : undefined};
	});

	const total = priced.reduce((sum, p) => sum + (p.cost ?? 0), 0);

	return (
		<div className={"flex flex-col gap-1"}>
			<div className={"flex flex-row items-baseline justify-between"}>
				<span className={strong
					? "text-xs font-semibold uppercase tracking-wide text-fg-muted"
					: "text-xs uppercase tracking-wide text-fg-subtle"}>
					{title}
				</span>
				{marketLoaded() && total > 0 && (
					<span className={"text-xs text-fg-subtle"}>{moneyLabel(total)} silver</span>
				)}
			</div>
			<div className={"flex flex-col"}>
				{priced.map(({req, cost}) => (
					<ShoppingRow key={req.item} urn={req.item} count={req.count} cost={cost} item={itemOf(items, req.item)} />
				))}
			</div>
		</div>
	);
}

function ShoppingRow({urn, count, cost, item}: {
	urn: string,
	count: number,
	cost: number | undefined,
	item: ReturnType<typeof itemOf>,
}) {
	return (
		<div
			className={"flex flex-row items-center gap-2 py-1 cursor-pointer hover:bg-surface-2/50 rounded-sm px-1"}
			data-testid={"shopping-row"}
			data-urn={urn}
			onClick={() => item && openItemPanel({id : item.id, name : item.title}, false)}
		>
			<ItemIcon urn={urn} className={"shrink-0"} imageClass={"w-5 h-5"} />
			<span className={"flex-1 min-w-0 truncate text-sm"} style={{color : tryGetGradeColor(item?.extra?.grade)?.toString()}}>
				{item?.title ?? urn}
			</span>
			<span className={"text-sm text-fg-subtle shrink-0"}>×{count}</span>
			{cost !== undefined && (
				<span className={"text-sm text-fg-muted shrink-0 w-28 text-right"}>{moneyLabel(cost)}</span>
			)}
		</div>
	);
}
