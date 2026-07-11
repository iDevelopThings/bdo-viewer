// Recipe "type" -> display label, ported from the old viewer's recipetree.go.
const recipeTypeDisplayName: Record<string, string> = {
	FIREWOOD          : "Chopping",
	ALCHEMY           : "Alchemy",
	COOK              : "Cooking",
	SIMPLE_ALCHEMY    : "Simple Alchemy",
	SIMPLE_COOK       : "Simple Cooking",
	HEAT              : "Heating",
	GRIND             : "Grinding",
	DRY               : "Drying",
	SHAKE             : "Shaking",
	THINNING          : "Filtering",
	CRAFT             : "Manufacture",
	GUILD             : "Guild Crafting",
	HOUSE             : "House Crafting",
	ROYALGIFT_ALCHEMY : "Imperial Alchemy",
	ROYALGIFT_COOK    : "Imperial Cooking",
};

export const RECIPE_TYPE_COLOR = "#6f9ad8";

export function recipeTypeLabel(type: string | undefined, station: string | undefined): string {
	if (!type) {
		return "";
	}

	let name = recipeTypeDisplayName[type] ?? type;
	if (station) {
		name += ` (${station})`;
	}

	return name;
}
