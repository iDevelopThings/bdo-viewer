import {ref} from "valtio/vanilla";
import type { UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {findSourceByType, type WrappedSource} from "@/state/sources/sources.ts";
import type {EnchantLevel, Enhancement, Item, KnowledgeEntry, KnowledgeTheme, Territory, WorldRegion} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetEntryDetailsByURN, GetStatsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import type {MaybeReadonly} from "@/types.ts";
import type {RecipeSelection, RecipeTree, Use} from "@bindings/bdo-viewer/internal/recipe";
import {ResolveRecipeTree} from "@bindings/bdo-viewer/internal/recipe/resolver.ts";
import type {ItemVendorData} from "@bindings/bdo-viewer/internal/catalog";
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

export function getEntryURN(entry: MaybeReadonly<UntypedSourceEntry | undefined>): string | undefined {
	return entry?.urn;
}

export function areEntriesEqual(a: UntypedSourceEntry | undefined, b: UntypedSourceEntry | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.urn === b.urn;
}

export type PartialSourceEntry = UntypedSourceEntry & {
	value: string | Item;
}


export type KnowledgeData = {
	themes?: KnowledgeTheme[],
	entries?: KnowledgeEntry[],
	breadcrumbs?: KnowledgeTheme[],
}
export type WorldInfoData = {
	territory?: Territory
	area?: WorldRegion
	warehouseGroup?: string[]
	variantKeys?: number[]
	npcs?: string[]
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


		if (!areEntriesEqual(this.entry, entry)) {
			this._loaded = false;
			this.loading = true;
			this.entry   = entry;

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
			return;
		}

		const entryURN = getEntryURN(this.entry);
		if (!entryURN) {
			console.error("DetailStore.load: entry has no urn", this.entry);
			this.loading = false;
			return;
		}

		this.loading = true;

		try {
			const data = await GetEntryDetailsByURN(entryURN);
			if (!data || !this.source) {
				this.loading = false;
				return;
			}

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
			// The details response already carries base-level (0/0) stats, so the panel can
			// paint them immediately; refreshStats only re-runs on enhance/caphras changes.
			if ("stats" in data) {
				this._stats = data.stats ?? [];
			}
			if ("usedIn" in data)
				// ref() — read-only list, replaced wholesale; skip valtio's per-entry proxying.
				this.usedIn = ref(data.usedIn || []);
			if ("vendors" in data)
				this.vendors = data.vendors || [];
			if ("regionExtra" in data) {
				const d          = data.regionExtra as WorldInfoData & { connectedTowns?: string[] };
				this.regionExtra = {
					area            : d.area,
					territory       : d.territory,
					warehouseGroup  : d.warehouseGroup ?? [],
					variantKeys     : d.variantKeys || [],
					npcs            : d.npcs || []
				};
			}

		} catch (error) {
			console.error("Failed to load details", error);
		}

		if ("enhancement" in this.entry.value) {
			this.enhancement = this.entry.value.enhancement;
			this.applyLevel(this._level);
			// The response's stats are base level (0/0); if a non-base enhance/caphras level was
			// restored, refresh them before dropping loading so the panel opens at its final size.
			if (this._level !== 0 || this._caphrasStep !== 0) {
				await this.refreshStats();
			}
		} else {
			this.enchant = undefined;
		}

		this.loading = false;

		// Refine the already-shown recipe tree with live prices once market data lands. Fire and
		// forget: recipes render from the details response, and scroll anchoring holds the reflow.
		void this.ensureEconomicRecipes();
	}

	private ensureSource() {
		/* 	if(this.source) {
				this.source = wrapSource(this.source);
				return;
			} */

		if (this.entry?.type) {
			this.source = findSourceByType(this.entry.type);
		}
	}

	public get gatheredFrom(): string[] {
		if (!this.entry || !("gatheredFrom" in this.entry.value)) {
			return [];
		}

		return this.entry.value.gatheredFrom || [];
	}

	/** URNs of the worldmap sub-nodes this item is gathered at (urn::world:node:<key>). */
	public get gatherNodes(): string[] {
		if (!this.entry || !("gatherNodes" in this.entry.value)) {
			return [];
		}

		return this.entry.value.gatherNodes?.urns || [];
	}

	public get valid() {
		return this.enhancement !== undefined && (this.enhancement.maxLevel > this.enhancement.minLevel);
	}

	public get minLevel() {
		const levels = this.enhancement?.levels ?? [];
		return levels.length > 0 ? levels[0].level : 0;
	}

	public get maxLevel() {
		const levels = this.enhancement?.levels ?? [];
		return levels.length > 0 ? levels[levels.length - 1].level : 0;
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

	// applyLevel is the synchronous part of setLevel (clamp + resolve enchant/caphras)
	// without the stats refetch, so load() can settle level before awaiting stats once.
	private applyLevel(value: number) {
		this._level = Math.max(this.minLevel, Math.min(this.maxLevel, value));

		if (this.enhancement) {
			this.enchant = this.enhancement.levels?.find(l => l.level === this._level);
		}
		this._caphrasStep = Math.min(this._caphrasStep, this.maxCaphrasStep);
	}

	public setLevel(value: number) {
		this.applyLevel(value);
		void this.refreshStats();
	}

	public setCaphrasStep(value: number) {
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
