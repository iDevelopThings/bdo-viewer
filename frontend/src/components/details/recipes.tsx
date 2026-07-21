import type {RecipeTreeByproduct} from "@bindings/bdo-viewer/internal/recipe";
import {RECIPE_TYPE_COLOR, recipeTypeLabel} from "@/lib/recipe-labels.ts";
import type {DeepReadonly} from "@/types.ts";
import {EntityChip, DetailsSection} from "@/components/details/details-components.tsx";
import {useDetail} from "@/state/detail.tsx";
import {RecipeTreeView} from "@/components/recipes/recipe-tree.tsx";
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
				<div className={"text-sm text-fg-subtle"}>{tree.status}</div>
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
						root={root}
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
			<div className={"text-sm text-fg-subtle"}>Procs while crafting these — not a guaranteed output.</div>
			<div className={"flex flex-col gap-2"}>
				{byproducts.map((bp, index) => (
					<ByproductEntry key={`byproduct-${index}`} bp={bp} items={items} />
				))}
			</div>
		</DetailsSection>
	);
}

function ByproductEntry({bp, items}: { bp: DeepReadonly<RecipeTreeByproduct>, items: RItems }) {
	const out = itemOf(items, bp.realOutput);

	return (
		<div className={"flex flex-col gap-1.5 bg-surface-2 rounded-md p-2"}>
			<div className={"flex flex-row gap-2 items-center flex-wrap"}>
				<EntityChip
					urn={bp.realOutput}
					name={out?.title ?? bp.realOutput}
					grade={out?.extra?.grade}
				/>
				<span className={"text-sm"} style={{color : RECIPE_TYPE_COLOR}}>{recipeTypeLabel(bp.type, bp.station)}</span>
			</div>
			{bp.inputs?.length ? (
				<div className={"flex flex-row flex-wrap gap-2 items-center"}>
					{bp.inputs.map((input, i) => {
						const inp = itemOf(items, input.item);
						return (
							<EntityChip
								key={`${input.item}:${i}`}
								urn={input.item}
								name={inp?.title ?? "Item"}
								grade={inp?.extra?.grade}
								compact
								trailing={!!input.count && <span className={"text-xs text-fg-subtle"}>×{input.count}</span>}
							/>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

export function DetailsUsedIn() {
	const [, snap] = useDetail();

	if (!snap.usedIn.length) {
		return null;
	}

	const usedIn = snap.usedIn;

	return (
		<DetailsSection title={`Used In (${usedIn.length})`} borderTop>
			<div className={"flex flex-col gap-2"}>
				{usedIn.map((use, index) => (
					<div key={index} className={"flex flex-row gap-2 items-center flex-wrap"}>
						<EntityChip
							urn={use.output.urn}
							name={use.output.title}
						/>
						<span className={"text-sm text-fg-subtle"}>via <span className={"font-bold"}>{recipeTypeLabel(use.type, use.station)}</span></span>
						{!!use.count && <span className={"text-sm text-fg-subtle"}>×{use.count}</span>}
					</div>
				))}
			</div>
		</DetailsSection>
	);
}
