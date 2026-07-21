package recipe

import (
	"strconv"

	"bdo-viewer/internal/sources"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// itemEntry projects an item to the slim display entry the recipe UI actually reads
// (name/grade/icon), instead of the full model.Item. A full item carries its ~84 KB
// enhancement curve, which a wide tree multiplies into tens of MB the UI never uses.
func itemEntry(it *model.Item) sources.ListSourceEntry {
	return sources.ListSourceEntry{
		URN:   urn.Item.New(it.ID).String(),
		Title: it.Name,
		Icon:  it.Icon,
		Extra: map[string]any{
			"grade": it.Grade,
		},
	}
}

// The lazy, selection-aware crafting tree: only the SELECTED path is expanded,
// and each node carries its alternatives as (item, count) metadata so the UI can
// re-pick a recipe or ingredient at any depth and re-request ResolveRecipeTree.
// Items are deduped into one map keyed by urn — each full entry sent once, not
// per node. Exported types are Recipe-prefixed because Wails emits their bindings
// as top-level names, where generic names (Node/Slot/Option) would collide.

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

	// Variants are the cluster's real recipes as option-index tuples (one per slot).
	// The UI lists these instead of the cartesian product of Slots, which for
	// non-independent slots is astronomically larger (9715: 43 real vs 240M combos).
	Variants [][]int `json:"variants"`
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
	Root       *RecipeTreeNode                     `json:"root,omitempty"`
	Byproducts []RecipeTreeByproduct               `json:"byproducts,omitempty"`
	Items      map[urn.URN]sources.ListSourceEntry `json:"items"`
	Status     string                              `json:"status,omitempty"`
}

// Use is one recipe that consumes a given item: what it produces, by which
// process, and how many of the queried item it takes. Output is the slim display
// entry (see itemEntry) — the recipe UI only needs its name/grade/icon.
type Use struct {
	Output  sources.ListSourceEntry `json:"output"`
	Type    string                  `json:"type"`
	Station string                  `json:"station"`
	Count   int                     `json:"count"`
}

// UsedIn returns every recipe that uses the item as an ingredient (deduped by
// output+type+count) — the inverse of the item's own recipes.
func (r *Resolver) UsedIn(u urn.URN) []Use {
	r.ensureIndexed()
	recs := r.byInput[u]
	uses := make([]Use, 0, len(recs))
	// ListSourceEntry has a map field so Use isn't comparable — dedup on a small key.
	type useKey struct {
		output  urn.URN
		typ     string
		station string
		count   int
	}
	seen := make(map[useKey]bool, len(recs))
	for _, rec := range recs {
		count := 0
		for _, in := range rec.Inputs {
			if in.Item.URN == u {
				count = in.Count
				break
			}
		}
		k := useKey{output: rec.Output.URN, typ: rec.Type, station: rec.Station, count: count}
		if seen[k] {
			continue
		}
		seen[k] = true
		out, ok := r.items.Get(rec.Output.URN)
		if !ok {
			continue
		}
		uses = append(uses, Use{
			Output:  itemEntry(out),
			Type:    rec.Type,
			Station: rec.Station,
			Count:   count,
		})
	}

	return uses
}

// ResolveRecipeTree resolves the item's crafting tree, honouring selections (keyed
// by node Path); any node without a selection uses its default (pickRecipe). Only
// the selected path is expanded — alternatives ride along as metadata for the UI.
func (r *Resolver) ResolveRecipeTree(u urn.URN, selections map[string]RecipeSelection, craftOverrides map[string]bool) RecipeTree {
	r.ensureIndexed()
	items := map[urn.URN]sources.ListSourceEntry{}
	addItem := func(x urn.URN) {
		if _, seen := items[x]; seen {
			return
		}
		if it, ok := r.items.Get(x); ok {
			items[x] = itemEntry(it)
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
		seenVariant := map[string]bool{} // dedup recipes that resolve to the same slot picks
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

			vk := make([]byte, 0, len(picks)*3)
			for _, p := range picks {
				vk = strconv.AppendInt(vk, int64(p), 10)
				vk = append(vk, ',')
			}
			if key := string(vk); !seenVariant[key] {
				seenVariant[key] = true
				cl.Variants = append(cl.Variants, picks)
			}
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
