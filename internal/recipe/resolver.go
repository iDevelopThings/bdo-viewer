// Package recipe resolves an item's crafting tree from the extracted item and
// recipe tables. It is shared by the CLI and the viewer so the "which recipe is
// the real one" heuristic lives in one place.
package recipe

import (
	"sync"

	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/utils"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// Resolver builds crafting trees from the item and recipe tables, keyed by
// item URN.
type Resolver struct {
	byOutput  map[urn.URN][]*model.Recipe
	byInput   map[urn.URN][]*model.Recipe
	byproduct map[urn.URN][]*model.Recipe // recipes an item only procs from (Recipe.ByproductOf set); kept off the craft tree
	gathered  map[urn.URN]bool
	maxDepth  int

	// yield gives the average output-per-craft for a recipe type at the player's
	// current mastery (>= 1). Injected at construction so this package stays free
	// of a catalog/config dependency; nil is treated as a flat 1 (no proc bonus).
	yield func(recipeType string) float64

	// marketPrice returns the live central-market price of an item and whether it's
	// listed. Injected (from the market service) so the economic cost model can
	// decide buy-vs-craft; nil / unlisted falls back to the item's vendor price.
	marketPrice func(u urn.URN) (int64, bool)

	items   *models.Store[model.Item]
	recipes *models.Store[model.Recipe]

	// The index is built lazily on first query: at construction the data may not
	// be loaded yet (the first-run wizard extracts it afterwards), and the item /
	// recipe stores only exist once the dataset is loaded.
	mu      sync.Mutex
	indexed bool
}

var Instance *Resolver

// NewResolver returns a resolver whose recipe index is built on first use.
// maxDepth bounds recursion; <= 0 selects a sensible default. yield supplies the
// per-craft mastery multiplier; marketPrice supplies live prices for the economic
// buy-vs-craft cost model (both may be nil — yield defaults to 1, prices fall back
// to vendor cost).
func NewResolver(maxDepth int, yield func(recipeType string) float64, marketPrice func(u urn.URN) (int64, bool)) *Resolver {
	if maxDepth <= 0 {
		maxDepth = 10
	}

	Instance = &Resolver{
		byOutput:    make(map[urn.URN][]*model.Recipe),
		byInput:     make(map[urn.URN][]*model.Recipe),
		byproduct:   make(map[urn.URN][]*model.Recipe),
		gathered:    make(map[urn.URN]bool),
		maxDepth:    maxDepth,
		yield:       yield,
		marketPrice: marketPrice,
	}

	return Instance
}

// ensureIndexed builds the recipe index the first time it's needed, and rebuilds
// it if the underlying stores have been replaced (a reload after re-extraction
// swaps in fresh stores). It's a no-op once built against the current stores, and
// a no-op (retried next call) while the dataset isn't loaded yet — so every public
// query must call it before reading the index.
func (r *Resolver) ensureIndexed() {
	r.mu.Lock()
	defer r.mu.Unlock()

	items := models.ResolveStore[model.Item]()
	recipes := models.ResolveStore[model.Recipe]()
	if items == nil || recipes == nil {
		return
	}
	if r.indexed && r.items == items && r.recipes == recipes {
		return
	}

	timed := utils.Timed("[RECIPES] Initializing recipe resolver")
	defer timed()

	// A reload replaces the stores, so the old index is stale — start clean.
	r.byOutput = make(map[urn.URN][]*model.Recipe)
	r.byInput = make(map[urn.URN][]*model.Recipe)
	r.byproduct = make(map[urn.URN][]*model.Recipe)
	r.gathered = make(map[urn.URN]bool)
	r.items = items
	r.recipes = recipes

	for _, it := range items.All() {
		if it.Gathered {
			r.gathered[it.GetURN()] = true
		}
	}
	for _, rec := range recipes.All() {
		// A byproduct recipe doesn't actually craft its Output (the item just
		// procs from it) — keep it out of the craft tree / "used in" index and
		// expose it separately for display. See Recipe.ByproductOf.
		out := rec.Output.URN
		if rec.ByproductOf != nil {
			r.byproduct[out] = append(r.byproduct[out], rec)
			continue
		}
		r.byOutput[out] = append(r.byOutput[out], rec)
		for _, in := range rec.Inputs {
			r.byInput[in.Item.URN] = append(r.byInput[in.Item.URN], rec)
		}
	}

	r.indexed = true
}

// IsCraftable reports whether the item has at least one (non-byproduct) recipe.
func (r *Resolver) IsCraftable(u urn.URN) bool {
	r.ensureIndexed()
	return len(r.byOutput[u]) > 0
}

// yieldFor returns the per-craft output multiplier for a recipe type (>= 1), or
// 1 when no yield provider was injected.
func (r *Resolver) yieldFor(recipeType string) float64 {
	if r.yield == nil {
		return 1
	}
	if m := r.yield(recipeType); m > 1 {
		return m
	}

	return 1
}
