package recipe

import (
	"strconv"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// This is the lazy, selection-aware crafting-tree model that replaces the old
// BuildFullRecipes (which fully materialised every alternative at every depth — a
// single draught serialised to ~4 MB / 1,150 nodes). Here only the SELECTED path
// is expanded; every node carries its alternatives as lightweight (item, count)
// metadata so the UI can re-pick a recipe or ingredient at any depth and re-request
// ResolveRecipeTree with the updated selections. Items are deduped into one map and
// referenced by id, so a full item object is sent once rather than per node.
//
// All exported types here are Recipe-prefixed on purpose: Wails generates frontend
// bindings for them as top-level names, so generic names (Node/Slot/Option) would
// collide.

// RecipeSlotOption is one ingredient choice for a slot: the item and how many.
type RecipeSlotOption struct {
	Item  urn.URN `json:"item"`
	Count int     `json:"count,omitempty"`
}

// RecipeSlot is one ingredient position of a cluster and the alternative items that
// can fill it (e.g. Elixir of Frenzy ×30 OR Elixir of Endless Frenzy ×10).
type RecipeSlot struct {
	Options []RecipeSlotOption `json:"options"`
}

// RecipeCluster is a family of an item's recipes that share a process + slot count,
// collapsed to per-slot alternatives — the "16 draught recipes → 1 grid" view.
type RecipeCluster struct {
	Type    string       `json:"type"`
	Station string       `json:"station,omitempty"`
	Slots   []RecipeSlot `json:"slots"`
}

// RecipeSelection is which cluster and which option per slot a node resolved with.
// The frontend echoes it back (keyed by RecipeTreeNode.Path) to re-resolve.
type RecipeSelection struct {
	Cluster int   `json:"cluster"`
	Slots   []int `json:"slots"`
}

// RecipeTreeNode is one item in the resolved tree. Clusters/Selected describe how it
// can be (and was) crafted; Children are the resolved ingredients of the selection.
type RecipeTreeNode struct {
	Path     string            `json:"path"` // stable position id ("root", "root/0", …) — the selection key
	Item     urn.URN           `json:"item"` // key into RecipeTree.Items
	Count    int               `json:"count,omitempty"`
	Gathered bool              `json:"gathered,omitempty"`
	Cycle    bool              `json:"cycle,omitempty"` // expansion stopped: item already on the path
	Clusters []RecipeCluster   `json:"clusters,omitempty"`
	Selected *RecipeSelection  `json:"selected,omitempty"`
	Children []*RecipeTreeNode `json:"children,omitempty"`

	// Craftable is true when the item has a production recipe, so the UI shows a
	// craft/buy toggle even when the economic default is to buy it. A craftable
	// node with Children is being crafted; without, it's bought (in the shopping
	// list) but the user can expand it to force-craft.
	Craftable bool `json:"craftable,omitempty"`

	// Crafts/Yield are set only by ResolveCraftPlan (the quantity-scaled calculator
	// view): Crafts is how many times this node's recipe runs (ceil(Count/Yield)),
	// Yield the per-craft output multiplier at the player's mastery (>1 = proc
	// bonus). Both are absent in the plain item-detail tree.
	Crafts int     `json:"crafts,omitempty"`
	Yield  float64 `json:"yield,omitempty"`
}

// RecipeTreeByproduct is a recipe the item only procs from (see Recipe.ByproductOf):
// RealOutput is what you actually craft, Inputs is that recipe's ingredients.
type RecipeTreeByproduct struct {
	RealOutput urn.URN            `json:"realOutput"`
	Type       string             `json:"type,omitempty"`
	Station    string             `json:"station,omitempty"`
	Inputs     []RecipeSlotOption `json:"inputs,omitempty"`
}

// RecipeTree is the response of ResolveRecipeTree: the resolved Root, any byproduct
// recipes, and the deduped item objects every id refers into.
type RecipeTree struct {
	Root       *RecipeTreeNode         `json:"root,omitempty"`
	Byproducts []RecipeTreeByproduct   `json:"byproducts,omitempty"`
	Items      map[urn.URN]*model.Item `json:"items"`
	Status     string                  `json:"status,omitempty"`
}

// Use is one recipe that consumes a given item: what it produces, by which
// process, and how many of the queried item it takes.
type Use struct {
	Output  *model.Item `json:"output"`
	Type    string      `json:"type"`
	Station string      `json:"station"`
	Count   int         `json:"count"`
}

// UsedIn returns every recipe that uses the item as an ingredient (deduped by
// output+type+count) — the inverse of the item's own recipes.
func (r *Resolver) UsedIn(u urn.URN) []Use {
	r.ensureIndexed()
	recs := r.byInput[u]
	uses := make([]Use, 0, len(recs))
	seen := make(map[Use]bool, len(recs))
	for _, rec := range recs {
		count := 0
		for _, in := range rec.Inputs {
			if in.Item.URN == u {
				count = in.Count
				break
			}
		}
		out := Use{
			Output:  r.items.GetUnsafe(rec.Output.URN),
			Type:    rec.Type,
			Station: rec.Station,
			Count:   count,
		}
		if seen[out] {
			continue
		}
		seen[out] = true
		uses = append(uses, out)
	}

	return uses
}

// ResolveRecipeTree resolves the item's crafting tree, honouring selections (keyed
// by node Path); any node without a selection uses its default (pickRecipe). Only
// the selected path is expanded — alternatives ride along as metadata for the UI.
func (r *Resolver) ResolveRecipeTree(u urn.URN, selections map[string]RecipeSelection, craftOverrides map[string]bool) RecipeTree {
	r.ensureIndexed()
	items := map[urn.URN]*model.Item{}
	addItem := func(x urn.URN) {
		if _, seen := items[x]; seen {
			return
		}
		if it, ok := r.items.Get(x); ok {
			items[x] = it
		}
	}

	out := RecipeTree{Items: items}

	byproducts := r.byproduct[u]
	it := r.items.GetUnsafe(u)
	material := (it != nil && it.Gathered) || len(r.UsedIn(u)) > 0
	if len(r.byOutput[u]) == 0 && !material && len(byproducts) == 0 {
		out.Status = "Item is neither craftable nor a base material."
		addItem(u)
		return out
	}

	out.Root = r.resolveNode(u, 0, "root", selections, craftOverrides, map[urn.URN]bool{}, 0, addItem, r.newCostModel())

	for _, bp := range byproducts {
		tb := RecipeTreeByproduct{RealOutput: bp.ByproductOf.URN, Type: bp.Type, Station: bp.Station}
		addItem(bp.ByproductOf.URN)
		for _, in := range bp.Inputs {
			tb.Inputs = append(tb.Inputs, RecipeSlotOption{Item: in.Item.URN, Count: in.Count})
			addItem(in.Item.URN)
		}
		out.Byproducts = append(out.Byproducts, tb)
	}
	return out
}

// shouldCraft decides whether a craftable node is crafted (expanded) or bought
// (collapsed): an explicit per-node override wins; else picking a recipe implies
// crafting; else the root is always crafted and children follow the economic
// buy-vs-craft default.
func (r *Resolver) shouldCraft(u urn.URN, path string, depth int, selections map[string]RecipeSelection, overrides map[string]bool, cm *costModel) bool {
	if ov, ok := overrides[path]; ok {
		return ov
	}
	if _, ok := selections[path]; ok {
		return true
	}
	return depth == 0 || cm.cost(u).craft
}

func (r *Resolver) resolveNode(
	u urn.URN, count int, path string,
	selections map[string]RecipeSelection, overrides map[string]bool, stack map[urn.URN]bool, depth int,
	addItem func(urn.URN), cm *costModel,
) *RecipeTreeNode {
	addItem(u)
	n := &RecipeTreeNode{Path: path, Item: u, Count: count}

	if depth > 0 && r.gathered[u] {
		n.Gathered = true
		return n
	}
	if cm.cost(u).recipe < 0 {
		return n // no production recipe: gathered/bought/un-craftable leaf
	}

	// Craftable: attach recipe metadata so the UI shows the craft/buy toggle + the
	// "N ways" picker, even when the economic default is to buy it.
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

	if !r.shouldCraft(u, path, depth, selections, overrides, cm) {
		return n // bought — collapsed; the toggle can force-craft it
	}
	if stack[u] || depth >= r.maxDepth {
		n.Cycle = stack[u]
		return n
	}

	stack[u] = true
	slots := clusters[sel.Cluster].Slots
	for i, sl := range slots {
		opt := sl.Options[sel.Slots[i]]
		n.Children = append(
			n.Children, r.resolveNode(
				opt.Item, opt.Count, path+"/"+strconv.Itoa(i),
				selections, overrides, stack, depth+1, addItem, cm,
			),
		)
	}
	delete(stack, u)
	return n
}

// resolveSelection builds an item's recipe clusters and resolves which (cluster,
// slot-options) selection applies at a node path — the pickRecipe default,
// overridden by selections[path]. ok is false when the item has no recipes (a
// leaf). Shared by resolveNode (tree display) and the craft-plan / BOM walk so
// the displayed tree and the rolled-up quantities always agree on which recipe
// each node uses.
func (r *Resolver) resolveSelection(u urn.URN, path string, selections map[string]RecipeSelection, cm *costModel) ([]RecipeCluster, RecipeSelection, bool) {
	recs := r.byOutput[u]
	if len(recs) == 0 {
		return nil, RecipeSelection{}, false
	}
	clusters, defaultFor := buildClusters(recs)
	idx := cm.cost(u).recipe // the economically cheapest recipe (buy-vs-craft aside)
	if idx < 0 {
		idx = 0
	}
	sel := defaultFor(idx)
	if s, ok := selections[path]; ok {
		sel = clampSelection(clusters, s)
	}

	return clusters, sel, true
}

// buildClusters groups an item's recipes into per-slot-alternative clusters (by
// process + slot count) and returns, alongside them, a mapping from a concrete
// recipe index to the (cluster, slot-picks) selection that reproduces it — used to
// seed a node's default selection from pickRecipe's choice.
func buildClusters(recs []*model.Recipe) ([]RecipeCluster, func(recIdx int) RecipeSelection) {
	var order []string
	group := map[string][]int{} // family key -> recipe indices
	clusterOf := map[string]int{}
	for i, rec := range recs {
		k := rec.Type + "\x00" + rec.Station + "\x00" + strconv.Itoa(len(rec.Inputs))
		if _, ok := clusterOf[k]; !ok {
			clusterOf[k] = len(order)
			order = append(order, k)
		}
		group[k] = append(group[k], i)
	}

	clusters := make([]RecipeCluster, len(order))
	recSel := make([]RecipeSelection, len(recs))
	for ci, k := range order {
		idxs := group[k]
		first := recs[idxs[0]]
		cl := RecipeCluster{Type: first.Type, Station: first.Station, Slots: make([]RecipeSlot, len(first.Inputs))}
		type optKey struct {
			item  urn.URN
			count int
		}
		seen := make([]map[optKey]int, len(cl.Slots)) // per slot: (item,count) -> option index
		for s := range seen {
			seen[s] = map[optKey]int{}
		}
		for _, ri := range idxs {
			rec := recs[ri]
			picks := make([]int, len(cl.Slots))
			for s := 0; s < len(cl.Slots); s++ {
				in := rec.Inputs[s]
				key := optKey{item: in.Item.URN, count: in.Count}
				oi, ok := seen[s][key]
				if !ok {
					oi = len(cl.Slots[s].Options)
					cl.Slots[s].Options = append(cl.Slots[s].Options, RecipeSlotOption{Item: in.Item.URN, Count: in.Count})
					seen[s][key] = oi
				}
				picks[s] = oi
			}
			recSel[ri] = RecipeSelection{Cluster: ci, Slots: picks}
		}
		clusters[ci] = cl
	}

	defaultFor := func(recIdx int) RecipeSelection {
		if recIdx >= 0 && recIdx < len(recSel) {
			return recSel[recIdx]
		}
		return RecipeSelection{Cluster: 0, Slots: make([]int, len(clusters[0].Slots))}
	}
	return clusters, defaultFor
}

// clampSelection keeps a client-supplied selection in range for the current
// clusters (recipes can change between requests), filling unset/invalid slots with
// option 0 so resolution never panics on a stale selection.
func clampSelection(clusters []RecipeCluster, s RecipeSelection) RecipeSelection {
	if s.Cluster < 0 || s.Cluster >= len(clusters) {
		s.Cluster = 0
	}
	slots := make([]int, len(clusters[s.Cluster].Slots))
	for i := range slots {
		if i < len(s.Slots) && s.Slots[i] >= 0 && s.Slots[i] < len(clusters[s.Cluster].Slots[i].Options) {
			slots[i] = s.Slots[i]
		}
	}
	return RecipeSelection{Cluster: s.Cluster, Slots: slots}
}
