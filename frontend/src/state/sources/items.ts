// Consumable buff families (BuffStackingCategory) → short display label.
import {BuffStackingCategory, type Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import type {MaybeNullable, MaybeReadonly} from "@/types.ts";

const BUFF_FAMILY: Record<BuffStackingCategory, string> = {
	[BuffStackingCategory.$zero]                                   : "",
	[BuffStackingCategory.BuffStackingCategoryFood]                : "Food",
	[BuffStackingCategory.BuffStackingCategoryDraughtResetControl] : "Draught",
	[BuffStackingCategory.BuffStackingCategoryPerfume]             : "Perfume",
	[BuffStackingCategory.BuffStackingCategoryCronMealExtra]       : "Cron",
	[BuffStackingCategory.BuffStackingCategoryElixir]              : "Elixir",
	[BuffStackingCategory.BuffStackingCategoryWhaleTendonElixir]   : "Whale Tendon",
};

// consumableFamily reads the item's broad buff family from its effect stats.
export function consumableFamily(item: MaybeNullable<MaybeReadonly<Item>>): string | undefined {
	if (!item) return undefined;
	const cats = item.effects?.buffCategories ?? [];
	for (let i = cats.length - 1; i >= 0; i--) {
		const type = cats[i];
		if (BUFF_FAMILY[type] != null) {
			return BUFF_FAMILY[type];
		}
	}

	return undefined;
}
