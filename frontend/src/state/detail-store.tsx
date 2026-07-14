import {ref} from "valtio/vanilla";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {findSourceByType, type WrappedSource} from "@/state/sources/sources.ts";
import {EnchantLevel, Enhancement, Item, KnowledgeEntry, KnowledgeTheme, Territory, WorldRegion} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetEntryDetails, GetEntryDetailsByURN, GetStatsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import {MaybeReadonly} from "@/types.ts";
import {RecipeSelection, RecipeTree, Use} from "@bindings/bdo-viewer/internal/recipe";
import {ResolveRecipeTree} from "@bindings/bdo-viewer/internal/recipe/resolver.ts";
import {ItemVendorData} from "@bindings/bdo-viewer/internal/catalog";
import {fetchMarket, marketLoaded} from "@/lib/market-data.tsx";

export type EntryDetailsData = {
	item?: Item
	knowledge?: KnowledgeData
	knowledgeExtra?: KnowledgeData
	recipes?: RecipeTree
	usedIn?: Use[]
	vendors?: ItemVendorData[]
	stats?: StatGroup[] | null
}

export function getEntryKey(entry: UntypedSourceEntry | undefined): string | undefined {
	if (!entry || !entry.value)
		return undefined;
	if (typeof entry.value === "number" || typeof entry.value === "string") {
		return entry.value.toString();
	}
	if ("id" in entry.value) {
		return entry.value.id;
	}
	if ("key" in entry.value) {
		return entry.value.key;
	}
	// if (!("id" in entry.value)) {
	// 	console.error("Invalid entry", entry);
	// 	return undefined;
	// }
	// return entry.value.id;
	console.error("Invalid entry", entry);
	return undefined;
}

export function getEntryURN(entry: MaybeReadonly<UntypedSourceEntry | undefined>): string | undefined {
	return entry?.urn;
}

export function areEntriesEqual(a: UntypedSourceEntry | undefined, b: UntypedSourceEntry | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	if (a.urn || b.urn) return a.urn === b.urn;
	if (a.type !== b.type) return false;
	const aKey = getEntryKey(a)?.toString();
	const bKey = getEntryKey(b)?.toString();

	// console.log("Comparing entries", a, b, aKey, bKey);

	return aKey === bKey;
}

export type PartialSourceEntry = UntypedSourceEntry & {
	value: number | string | Item;
}


export type KnowledgeData = {
	themes?: KnowledgeTheme[],
	entries?: KnowledgeEntry[],
	breadcrumbs?: KnowledgeTheme[],
}
export type WorldInfoData = {
	territory?: Territory
	area?: WorldRegion
	connectedTowns?: string[]
	variantKeys?: number[]
	npcs?: number[]
}

export class DetailStore {
	public loading: boolean  = true;
	private _loaded: boolean = false;

	public entry: UntypedSourceEntry | undefined = undefined;
	public source: WrappedSource | undefined     = undefined;

	private _level: number                      = 0;
	private _caphrasStep: number                = 0;
	public enhancement: Enhancement | undefined = undefined;
	public enchant: EnchantLevel | undefined    = undefined;
	private _stats: StatGroup[]                 = [];

	public recipes: RecipeTree | undefined = undefined;
	// per-node recipe/ingredient selections (keyed by RecipeTreeNode.path); sent to
	// ResolveRecipeTree to re-resolve after the user picks an alternative.
	public recipeSelections: Record<string, RecipeSelection> = {};
	public recipeCraftOverrides: Record<string, boolean>     = {};
	public usedIn: Use[]                                     = [];

	public knowledge: KnowledgeData | undefined  = undefined;
	public vendors: ItemVendorData[] | undefined = undefined;

	public regionExtra: WorldInfoData | undefined = undefined;


	public scrollOffset: number = 0;

	public constructor(entry: PartialSourceEntry | undefined) {
		this.entry = entry;
	}

	public initialize(entry: PartialSourceEntry | undefined) {
		if (!entry) {
			throw new Error("DetailStore must be initialized with an entry");
		}

		// console.log("Init entry: ", this.entry, entry);

		if (!areEntriesEqual(this.entry, entry)) {
			this._loaded = false;
			this.loading = true;
			this.entry   = entry;

			// console.log("DetailStore: entry changed, resetting loaded state", entry);
		}

		this.ensureSource();

		this.load();

		this._loaded = true;
	}

	public async load() {
		if (!this.entry) {
			throw new Error("DetailStore must be initialized with an entry");
		}
		if (this._loaded) {
			// console.warn("DetailStore is already loaded, skipping load", this.entry);
			return;
		}

		// console.log("Loading details for entry", this.entry);

		this.loading = true;

		try {
			const entryURN               = getEntryURN(this.entry);
			const data: EntryDetailsData = entryURN
				? await GetEntryDetailsByURN(entryURN)
				: await GetEntryDetails(
					this.entry.type,
					parseInt(getEntryKey(this.entry))
				);
			// console.log("Loaded details for entry", this.entry, data);

			this.entry.value = data[this.source.kind];

			if ("knowledge" in data && this.entry.type !== SourceKind.Knowledge)
				this.knowledge = data.knowledge;
			if ("knowledgeExtra" in data)
				this.knowledge = {
					...this.knowledge,
					...data.knowledgeExtra
				};
			if ("recipes" in data) {
				this.recipes              = data.recipes ? ref(data.recipes) : data.recipes;
				this.recipeSelections     = {};
				this.recipeCraftOverrides = {};
			}
			if ("usedIn" in data)
				// ref() — read-only list, replaced wholesale; skip valtio's per-entry proxying.
				this.usedIn = ref(data.usedIn || []);
			if ("vendors" in data)
				this.vendors = data?.vendors || [];
			if ("regionExtra" in data) {
				const d          = data.regionExtra as WorldInfoData;
				this.regionExtra = {
					area           : d?.area,
					territory      : d?.territory,
					connectedTowns : d?.connectedTowns || [],
					variantKeys    : d?.variantKeys || [],
					npcs           : d?.npcs || []
				};
			}

		} catch (error) {
			console.error("Failed to load details", error);
		}

		if ("enhancement" in this.entry.value) {
			this.enhancement = this.entry.value.enhancement;
			this.setLevel(this._level);
		} else {
			this.enchant = undefined;
			void this.refreshStats();
		}

		this.loading = false;

		void this.ensureEconomicRecipes();
	}

	private ensureSource() {
		/* 	if(this.source) {
				this.source = wrapSource(this.source);
				return;
			} */

		if (this.entry.type) {
			this.source = findSourceByType(this.entry.type);
		}
	}

	public postLoad() {
		this.initialize(this.entry);
	}

	public get gatheredFrom(): string[] {
		if (!("gatheredFrom" in this.entry.value)) {
			return [];
		}

		return this.entry.value.gatheredFrom || [];
	}

	/** URNs of the worldmap sub-nodes this item is gathered at (urn::world:node:<key>). */
	public get gatherNodes(): string[] {
		if (!("gatherNodes" in this.entry.value)) {
			return [];
		}

		return this.entry.value.gatherNodes?.urns || [];
	}

	public get valid() {
		return this.enhancement !== undefined && (this.enhancement?.maxLevel > this.enhancement?.minLevel);
	}

	public get minLevel() {
		if (!this.enhancement) {
			return 0;
		}
		return this.enhancement.levels.length > 0 ? this.enhancement.levels[0].level : 0;
	}

	public get maxLevel() {
		if (!this.enhancement) {
			return 0;
		}
		return this.enhancement.levels.length > 0 ? this.enhancement.levels[this.enhancement.levels.length - 1].level : 0;
	}


	public get stats(): StatGroup[] {
		return this._stats;
	}

	public get level() {
		return this._level;
	}

	public get levelName(): string {
		return this.enchant?.name ?? "Base";
	}

	public set level(value: number) {
		this.setLevel(value);
	}

	public get caphrasStep() {
		return this._caphrasStep;
	}

	public set caphrasStep(value: number) {
		this.setCaphrasStep(value);
	}

	// maxCaphrasStep is only nonzero at the enchant levels Caphras applies to
	// (TRI/TET/PEN) - see EnchantLevel.Caphras.
	public get maxCaphrasStep(): number {
		const caphras = this.enchant?.caphras ?? [];
		return caphras.length > 0 ? Math.max(...caphras.map(c => c.level)) : 0;
	}

	private setLevel(value: number) {
		this._level = Math.max(this.minLevel, Math.min(this.maxLevel, value));

		if (this.enhancement) {
			this.enchant = this.enhancement.levels.find(l => l.level === this._level);
		}
		this._caphrasStep = Math.min(this._caphrasStep, this.maxCaphrasStep);

		void this.refreshStats();
	}

	private setCaphrasStep(value: number) {
		this._caphrasStep = Math.max(0, Math.min(this.maxCaphrasStep, value));
		void this.refreshStats();
	}

	// refreshStats pulls the fully-resolved stat/effect groups from the backend
	// (Card + Effects StatGroups - see internal/stats) rather than re-deriving
	// anything from the raw enchant/effect data client-side.
	private async refreshStats() {
		const urn = getEntryURN(this.entry);
		if (!urn) {
			this._stats = [];
			return;
		}
		this._stats = (await GetStatsByURN(urn, this._level, this._caphrasStep)) ?? [];
	}


	/// ---------------------- RECIPES


	// ensureEconomicRecipes re-resolves the recipe tree once live prices are loaded,
	// so the buy-vs-craft decisions reflect real economics even when the detail was
	// opened before market data arrived.
	private async ensureEconomicRecipes() {
		const rootId = this.recipes?.root?.item;
		if (!rootId || marketLoaded()) {
			return;
		}
		await fetchMarket();
		await this.fetchRecipeTree(rootId);
	}

	private async fetchRecipeTree(rootId: string) {
		try {
			this.recipes = ref(await ResolveRecipeTree(rootId, this.recipeSelections, this.recipeCraftOverrides));
		} catch (error) {
			console.error("Failed to re-resolve recipe tree with prices", error);
		}
	}

	// selectRecipe records a per-node recipe/ingredient choice (keyed by the node's
	// path) and re-resolves the tree from the backend. It's async on purpose — only
	// the selected path expands, so the payload stays small.
	public async selectRecipe(path: string, selection: RecipeSelection) {
		const rootId = this.recipes?.root?.item;
		if (!rootId) {
			return;
		}
		this.recipeSelections = {...this.recipeSelections, [path] : selection};
		await this.fetchRecipeTree(rootId);
	}

	// toggleCraft forces a node (by path) to craft or buy and re-resolves the tree.
	public async toggleCraft(path: string, craft: boolean) {
		const rootId = this.recipes?.root?.item;
		if (!rootId) {
			return;
		}
		this.recipeCraftOverrides = {...this.recipeCraftOverrides, [path] : craft};
		await this.fetchRecipeTree(rootId);
	}

}
