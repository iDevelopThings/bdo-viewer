import {RecipeTreeByproduct} from "@bindings/bdo-viewer/internal/recipe";
import {RECIPE_TYPE_COLOR, recipeTypeLabel} from "@/lib/recipe-labels.ts";
import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import type {DeepReadonly} from "@/types.ts";
import {openItemPanel} from "@/state/panels.ts";
import {ItemIcon} from "@/lib/item-icon.tsx";
import {DetailsSection} from "@/components/details/details-components.tsx";
import {useDetail} from "@/state/detail.tsx";
import {getMiddleClickProps} from "@/utils.tsx";
import {RecipeTreeView} from "@/components/recipes/recipe-tree.tsx";
import {tryGetGradeColor} from "@/lib/types/item-grades.ts";
import {itemOf, type RItems} from "@/components/recipes/recipe-tree-context.tsx";

// DetailsRecipes is the item-detail wrapper around the shared RecipeTreeView: it
// backs selection with the detail store (selectRecipe re-resolves the tree) and
// expansion with the global expanded set, and adds the byproducts section.
export function DetailsRecipes() {
	const [detail, snap] = useDetail();
	const tree           = snap.recipes;

	if (!tree) {
		return null;
	}
	if (tree.status) {
		return (
			<DetailsSection title={"Recipes"} borderTop>
				<div className={"text-sm text-zinc-400"}>{tree.status}</div>
			</DetailsSection>
		);
	}

	const root       = tree.root;
	const items      = tree.items ?? {};
	const byproducts = tree.byproducts ?? [];
	const craftable  = !!root?.clusters?.length;

	if (!craftable && byproducts.length === 0) {
		return null;
	}

	return (
		<>
			{craftable && (
				<DetailsSection title={"Recipes"} borderTop>
					<RecipeTreeView
						root={root!}
						items={items}
						onSelectRecipe={(path, sel) => detail.selectRecipe(path, sel)}
						onToggleCraft={(path, craft) => detail.toggleCraft(path, craft)}
					/>
				</DetailsSection>
			)}
			{byproducts.length > 0 && <ByproductsSection byproducts={byproducts} items={items} />}
		</>
	);
}

// ByproductsSection shows recipes the item does not actually craft — it procs from
// them as a byproduct (see Recipe.ByproductOf). Each entry is the item you really
// craft, so the craft tree above isn't polluted with "make X by chopping logs".
function ByproductsSection({byproducts, items}: { byproducts: DeepReadonly<RecipeTreeByproduct[]>, items: RItems }) {
	return (
		<DetailsSection title={`Byproduct Of (${byproducts.length})`} borderTop>
			<div className={"text-sm text-zinc-400"}>Procs while crafting these — not a guaranteed output.</div>
			<div className={"flex flex-col gap-2"}>
				{byproducts.map((bp, index) => (
					<ByproductEntry key={`byproduct-${index}`} bp={bp} items={items} />
				))}
			</div>
		</DetailsSection>
	);
}

function ByproductEntry({bp, items}: { bp: DeepReadonly<RecipeTreeByproduct>, items: RItems }) {
	const out   = itemOf(items, bp.realOutput);
	const color = tryGetGradeColor(out?.extra?.grade)?.toString() ?? "#d4d4d8";

	return (
		<div className={"flex flex-col gap-1.5 bg-zinc-800 rounded-md p-2"}>
			<div className={"flex flex-row gap-2 items-center flex-wrap"}>
				<div
					className={"flex flex-row gap-1 items-center bg-zinc-700/50 px-1.5 py-0.5 rounded-md cursor-pointer select-none"}
					{...getMiddleClickProps(
						() => out && openItemPanel({id : out.id, name : out.title}, false),
						() => out && openItemPanel({id : out.id, name : out.title}, true),
					)}
				>
					<ItemIcon urn={bp.realOutput} className={"shrink-0"} imageClass={"w-4 h-4"} />
					<span className={"text-sm"} style={{color}}>{out?.title}</span>
				</div>
				<span className={"text-sm"} style={{color : RECIPE_TYPE_COLOR}}>{recipeTypeLabel(bp.type, bp.station)}</span>
			</div>
			{bp.inputs?.length ? (
				<div className={"flex flex-row flex-wrap gap-2 items-center"}>
					{bp.inputs.map((input, i) => (
						<EntryTooltip key={`${input.item}:${i}`} urn={input.item} className={"shrink-0"} side={"top"}>
							<div className={"flex flex-row gap-1 items-center bg-zinc-700/50 px-1.5 py-0.5 rounded-md select-none"}>
								<ItemIcon urn={input.item} className={"shrink-0"} imageClass={"w-4 h-4"} />
								<span className={"text-sm text-zinc-300"}>×{input.count}</span>
							</div>
						</EntryTooltip>
					))}
				</div>
			) : null}
		</div>
	);
}

export function DetailsUsedIn() {
	const [, snap] = useDetail();

	if (!snap?.usedIn?.length) {
		return null;
	}

	const usedIn = snap.usedIn;

	return (
		<DetailsSection title={`Used In (${usedIn.length})`} borderTop>
			<div className={"flex flex-col gap-2"}>
				{usedIn.map((use, index) => (
					<div
						key={index}
						className={"flex flex-row gap-2 items-center cursor-pointer"}
						{...getMiddleClickProps(
							() => openItemPanel({id : use.output.id, name : use.output.title}, false),
							() => openItemPanel({id : use.output.id, name : use.output.title}, true),
						)}
					>
						<EntryTooltip urn={use.output.urn} className={"gap-2"} side={"top"}>
							<div className={"flex flex-row gap-1 items-center bg-zinc-700/50 px-1.5 py-0.5 rounded-md select-none"}>
								<img src={use.output.icon} alt={use.output.title} className={"w-4 h-4"} />
								<span className={"text-sm text-zinc-300"}>{use.output.title}</span>
							</div>
							<span className={"text-sm text-zinc-400"}>via <span className={"font-bold"}>{recipeTypeLabel(use.type, use.station)}</span></span>
							<span className={"text-sm text-zinc-400"}>×{use.count}</span>
						</EntryTooltip>
					</div>
				))}
			</div>
		</DetailsSection>
	);
}
