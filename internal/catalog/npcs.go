package catalog

import (
	"sort"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
	"github.com/idevelopthings/bdo-data-extractor/src/utils"
)

// GetNpcsByURN resolves NPC URNs to their NPCs, skipping any that don't resolve
// (thin facade over the npc Store, owned by NpcSource).
func (c *Catalog) GetNpcsByURN(urns []urn.URN) []*model.NPC {
	out := make([]*model.NPC, 0, len(urns))
	for _, u := range urns {
		if n, ok := models.ResolveUrn[model.NPC](u); ok {
			out = append(out, n)
		}
	}

	return out
}

type ItemVendorData struct {
	Name  string   `json:"name"`
	Towns []string `json:"towns"`
}

func (c *Catalog) GetItemVendorData(u urn.URN) []ItemVendorData {
	item, ok := models.ResolveUrn[model.Item](u)
	if !ok || item == nil {
		return nil
	}

	out := make([]ItemVendorData, len(item.Vendors))
	for i, vendor := range item.Vendors {
		out[i].Name = vendor
		out[i].Towns = vendorTowns(vendor)
	}

	return out
}

// vendorTowns returns the distinct towns/areas a vendor name is found in (the
// spawn-region names across every NPC sharing that name), sorted.
func vendorTowns(name string) []string {
	var towns []string
	for _, n := range Npcs.ByName.Get()[name] {
		for _, s := range n.Spawns {
			if s.RegionName != "" {
				towns = utils.AppendUnique(towns, s.RegionName)
			}
		}
	}
	sort.Strings(towns)

	return towns
}
