package catalog

import (
	"sort"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// GetNpcsByURN resolves NPC URNs to their NPCs, skipping any that don't resolve
// (thin facade over the npc Store, owned by NpcSource).
func (c *Catalog) GetNpcsByURN(urns []urn.URN) []*model.NPC {
	return models.ResolveUrns[model.NPC](urns)
}

// GetPlacedNpcs returns every NPC the world places at least once — the map draws a
// marker per placement. The unplaced ones (no spawn) have nowhere to go, so they're
// left out rather than shipped and filtered on the frontend.
func (c *Catalog) GetPlacedNpcs() []*model.NPC {
	all := Npcs.Store.All()
	out := make([]*model.NPC, 0, len(all))
	for _, n := range all {
		if len(n.Spawns) > 0 {
			out = append(out, n)
		}
	}

	return out
}

// ItemVendorData is one vendor of an item, grouped by name: a vendor like "Clorince"
// is placed once per town, and the UI wants one entry listing all of them. Title is
// the NPC's role label ("<Farm Vendor>"). Spawns carries each placement's region and
// world position — the towns to name and the places to send the map. Both are empty
// for a vendor the client's NPC table has no record of (Item.UnresolvedVendors).
type ItemVendorData struct {
	Name   string           `json:"name"`
	Title  string           `json:"title,omitempty"`
	URNs   []urn.URN        `json:"urns,omitempty"`
	Spawns []model.NPCSpawn `json:"spawns,omitempty"`
}

func (c *Catalog) GetItemVendorData(u urn.URN) []ItemVendorData {
	item, ok := models.ResolveUrn[model.Item](u)
	if !ok || item == nil {
		return nil
	}

	byName := map[string]*ItemVendorData{}
	if item.Vendors != nil {
		for _, npc := range item.Vendors.AllBulk() {
			if npc == nil {
				continue
			}
			v := byName[npc.Name]
			if v == nil {
				v = &ItemVendorData{Name: npc.Name}
				byName[npc.Name] = v
			}
			if v.Title == "" {
				v.Title = npc.Title
			}
			v.URNs = append(v.URNs, urn.NPC.New(npc.ID))
			v.Spawns = append(v.Spawns, npc.Spawns...)
		}
	}
	for _, name := range item.UnresolvedVendors {
		if byName[name] == nil {
			byName[name] = &ItemVendorData{Name: name}
		}
	}

	out := make([]ItemVendorData, 0, len(byName))
	for _, v := range byName {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	return out
}
