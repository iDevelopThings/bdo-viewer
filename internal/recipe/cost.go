package recipe

import (
	"math"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// This is the economic core of recipe resolution. Instead of heuristics
// (isExtraction, fewest-inputs) it decides, per item, the cheapest way to
// ACQUIRE it — buy it, or craft it — and which recipe. That single rule replaces
// every heuristic: it breaks cycles (crafting X from something that needs X falls
// back to X's buy price, which never wins), rejects reverse/extraction recipes
// (they consume expensive inputs, so crafting loses), and picks the real
// direction. It mirrors what a crafting calculator is for, and what bdolytics does.

// costUnknown marks an item we can't price (not market-listed, no vendor price,
// and not craftable down to priced leaves).
const costUnknown = int64(math.MaxInt64)

// nodeCost is the cheapest acquisition for one unit of an item.
type nodeCost struct {
	cost   int64 // silver per unit; costUnknown when unpriceable
	craft  bool  // crafting is chosen over buying → expand this node
	recipe int   // index into byOutput[item] of the chosen recipe; -1 if none
}

// costModel memoizes buy-vs-craft over one resolve pass (prices change between
// passes, so it isn't shared across calls).
type costModel struct {
	r         *Resolver
	memo      map[urn.URN]nodeCost
	computing map[urn.URN]bool
}

func (r *Resolver) newCostModel() *costModel {
	return &costModel{r: r, memo: map[urn.URN]nodeCost{}, computing: map[urn.URN]bool{}}
}

// buyPrice is the silver to acquire one unit without crafting: the live market
// price, else the NPC vendor price BUT only for items actually sold by a vendor
// (a non-empty Vendors list). Item.BuyPrice is a nominal "original price" present
// on almost everything — using it unconditionally would make untradeable boss
// materials (reform stones, etc.) look cheaply buyable and wreck the economics.
func (cm *costModel) buyPrice(u urn.URN) int64 {
	if cm.r.marketPrice != nil {
		if p, ok := cm.r.marketPrice(u); ok && p > 0 {
			return p
		}
	}
	if it, ok := cm.r.items.Get(u); ok && it.BuyPrice > 0 && vendorSold(it) {
		return it.BuyPrice
	}
	return costUnknown
}

// vendorSold reports whether an NPC vendor sells the item — including the handful
// whose only vendors have no NPC record behind them (Item.UnresolvedVendors).
func vendorSold(it *model.Item) bool {
	return (it.Vendors != nil && it.Vendors.Len() > 0) || len(it.UnresolvedVendors) > 0
}

// cost returns the cheapest acquisition for one unit of u. Crafting is chosen when
// cheaper than buying — or, when u has no buy price, whenever a recipe exists (so
// an unpriced-but-craftable item still expands toward priced/gathered leaves). An
// item already being computed (a cycle) is priced at its buy cost, so the reverse
// recipe never wins and the cycle resolves to "buy".
func (cm *costModel) cost(u urn.URN) nodeCost {
	if c, ok := cm.memo[u]; ok {
		return c
	}
	if cm.computing[u] {
		return nodeCost{cost: cm.buyPrice(u), craft: false, recipe: -1}
	}
	cm.computing[u] = true

	buy := cm.buyPrice(u)
	best := nodeCost{cost: buy, craft: false, recipe: -1}

	bestCraftCost := costUnknown
	bestCraftIdx := -1
	bestGathered := -1 // structural tiebreak used only when craft costs are unknown
	for i, rec := range cm.r.byOutput[u] {
		if cm.consumesEquip(rec) || isRecovery(rec) {
			continue // recovery from a finished item, not scalable production
		}
		total := int64(0)
		gathered := 0
		for _, in := range rec.Inputs {
			total = addSat(total, mulSat(cm.cost(in.Item.URN).cost, max(in.Count, 1)))
			if cm.r.gathered[in.Item.URN] {
				gathered++
			}
		}
		craftCost := total
		if craftCost != costUnknown {
			if y := cm.r.yieldFor(rec.Type); y > 1 {
				craftCost = int64(math.Round(float64(total) / y))
			}
		}
		if craftCost < bestCraftCost || (craftCost == bestCraftCost && gathered > bestGathered) {
			bestCraftCost, bestCraftIdx, bestGathered = craftCost, i, gathered
		}
	}

	if bestCraftIdx >= 0 {
		best.recipe = bestCraftIdx
		if bestCraftCost < buy || buy == costUnknown {
			best.craft = true
			best.cost = min(bestCraftCost, buy)
		}
	}

	delete(cm.computing, u)
	cm.memo[u] = best

	return best
}

// isRecovery reports whether a recipe just breaks a single finished item back into
// a material — Heat/Grind ONE crystal, reform stone, or piece of gear to reclaim
// its Black Stone Powder / shard. These reclaim embedded value from a limited
// supply of finished goods; they're one-offs, not a scalable production chain, so
// even when a cheap crystal makes the unit maths look good they're excluded from
// costing. Real processing batches several raw units (count > 1). The economic
// model still does the actual recipe selection — this only filters non-production
// recipes out of the candidate set.
func isRecovery(rec *model.Recipe) bool {
	return (rec.Type == "HEAT" || rec.Type == "GRIND") && len(rec.Inputs) == 1 && rec.Inputs[0].Count <= 1
}

// consumesEquip reports whether a recipe consumes an equippable item — recovering
// an embedded material from gear rather than producing it from raw inputs.
// Equipment is never a scalable material source (isRecovery catches the common
// single-input case; this also covers any multi-input gear recipe).
func (cm *costModel) consumesEquip(rec *model.Recipe) bool {
	for _, in := range rec.Inputs {
		if it, ok := cm.r.items.Get(in.Item.URN); ok && it.EquipInfo != nil {
			return true
		}
	}
	return false
}

func addSat(a, b int64) int64 {
	if a == costUnknown || b == costUnknown {
		return costUnknown
	}
	if s := a + b; s >= a {
		return s
	}
	return costUnknown
}

func mulSat(a int64, n int) int64 {
	if n <= 0 {
		return 0
	}
	if a == costUnknown {
		return costUnknown
	}
	if p := a * int64(n); p/int64(n) == a {
		return p
	}
	return costUnknown
}
