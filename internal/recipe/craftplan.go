package recipe

import (
	"math"
	"sort"
	"strconv"

	"bdo-viewer/internal/sources"

	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// This is the crafting-calculator layer over the recipe resolver: quantity- and
// mastery-yield-scaled crafting of one or more target items. It reuses the same
// selection resolution as the item-detail tree (resolveSelection), so the tree a
// user sees and the materials it rolls up always agree on which recipe each node
// uses. The plain ResolveRecipeTree stays per-craft (unscaled) for item detail;
// everything here is cumulative and yield-scaled.

// CraftTarget is one item + quantity in the calculator's craft list, with the
// per-node recipe selections chosen for its tree (keyed by RecipeTreeNode.Path).
type CraftTarget struct {
	Item       urn.URN                    `json:"item"`
	Qty        int                        `json:"qty"`
	Selections map[string]RecipeSelection `json:"selections,omitempty"`
	// CraftOverrides forces a node (by path) to craft (true) or buy (false),
	// overriding the economic default — the tree's craft/buy toggle.
	CraftOverrides map[string]bool `json:"craftOverrides,omitempty"`
}

// Requirement is an item and a total quantity in a rolled-up bill of materials.
type Requirement struct {
	Item  urn.URN `json:"item"`
	Count int     `json:"count"`
}

// CraftPlan is the resolved crafting of a single target: the quantity/yield-
// scaled tree for display and the base materials it rolls up to (gathered /
// bought / un-craftable leaves).
type CraftPlan struct {
	Tree RecipeTree    `json:"tree"`
	Base []Requirement `json:"base"`
}

// ResolveCraftPlan resolves crafting qty of target into a scaled tree (honouring
// selections, keyed by node Path) plus its base-material rollup. Child counts are
// cumulative — an intermediate needing N units runs ceil(N/yield) crafts and its
// inputs scale by that — so the tree shows the true totals for the requested qty.
func (r *Resolver) ResolveCraftPlan(target urn.URN, qty int, selections map[string]RecipeSelection, craftOverrides map[string]bool) CraftPlan {
	r.ensureIndexed()
	if qty < 1 {
		qty = 1
	}
	items := map[urn.URN]sources.ListSourceEntry{}
	addItem := func(x urn.URN) {
		if _, seen := items[x]; seen {
			return
		}
		if it, ok := r.items.Get(x); ok {
			items[x] = itemEntry(it)
		}
	}
	base := map[urn.URN]int{}
	root := r.resolveCraftNode(target, qty, "root", selections, craftOverrides, map[urn.URN]bool{}, 0, addItem, base, r.newCostModel())

	return CraftPlan{
		Tree: RecipeTree{Root: root, Items: items},
		Base: sortRequirements(base),
	}
}

// BillOfMaterials rolls up the combined base materials to craft every target
// (each at its quantity and with its own recipe selections) into one shopping
// list, summed across targets and sorted by quantity.
func (r *Resolver) BillOfMaterials(targets []CraftTarget) []Requirement {
	r.ensureIndexed()
	base := map[urn.URN]int{}
	cm := r.newCostModel()
	for _, t := range targets {
		qty := t.Qty
		if qty < 1 {
			qty = 1
		}
		r.resolveCraftNode(t.Item, qty, "root", t.Selections, t.CraftOverrides, map[urn.URN]bool{}, 0, func(urn.URN) {}, base, cm)
	}

	return sortRequirements(base)
}

// resolveCraftNode is the scaled walk shared by ResolveCraftPlan and
// BillOfMaterials. It builds the (optional) tree node and accumulates base
// materials into base. addItem may be a no-op when only the rollup is needed.
func (r *Resolver) resolveCraftNode(
	u urn.URN, count int, path string,
	selections map[string]RecipeSelection, overrides map[string]bool, stack map[urn.URN]bool, depth int,
	addItem func(urn.URN), base map[urn.URN]int, cm *costModel,
) *RecipeTreeNode {
	addItem(u)
	n := &RecipeTreeNode{Path: path, Item: u, Count: count}

	if depth > 0 && r.gathered[u] {
		n.Gathered = true
		base[u] += count
		return n
	}
	if cm.cost(u).recipe < 0 {
		base[u] += count // no production recipe: gathered / bought / un-craftable
		return n
	}

	// Craftable: attach recipe metadata so the UI shows the craft/buy toggle + the
	// "N ways" picker even when the default is to buy it.
	clusters, sel, _ := r.resolveSelection(u, path, selections, cm)
	n.Clusters = clusters
	n.Craftable = true
	for _, cl := range clusters {
		for _, sl := range cl.Slots {
			for _, op := range sl.Options {
				addItem(op.Item)
			}
		}
	}
	n.Selected = &sel

	// Craft (expand) or buy (collapse) — the shopping list is exactly the bought
	// leaves. The root is always crafted; children follow the override / economics.
	if !r.shouldCraft(u, path, depth, selections, overrides, cm) {
		base[u] += count
		return n
	}

	if stack[u] || depth >= r.maxDepth {
		n.Cycle = stack[u]
		base[u] += count // stop expanding, but the material is still needed
		return n
	}

	cl := clusters[sel.Cluster]
	yield := r.yieldFor(cl.Type)
	crafts := count
	if yield > 1 {
		if crafts = int(math.Ceil(float64(count) / yield)); crafts < 1 {
			crafts = 1
		}
		n.Yield = yield
	}
	n.Crafts = crafts

	stack[u] = true
	for i, sl := range cl.Slots {
		opt := sl.Options[sel.Slots[i]]
		n.Children = append(
			n.Children, r.resolveCraftNode(
				opt.Item, max(opt.Count, 1)*crafts, path+"/"+strconv.Itoa(i),
				selections, overrides, stack, depth+1, addItem, base, cm,
			),
		)
	}
	delete(stack, u)

	return n
}

// sortRequirements flattens a total map into a slice ordered by quantity
// (descending), ties broken by item URN, for stable display.
func sortRequirements(m map[urn.URN]int) []Requirement {
	out := make([]Requirement, 0, len(m))
	for it, c := range m {
		out = append(out, Requirement{Item: it, Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}

		return out[i].Item.String() < out[j].Item.String()
	})

	return out
}
