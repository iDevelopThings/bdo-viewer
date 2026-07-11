package catalog

import (
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// Item returns the item with the given URN, or nil. Thin facade over the item
// Store (owned by ItemSource) for the frontend's direct id lookups.
func (c *Catalog) Item(u urn.URN) *model.Item {
	it, _ := models.ResolveUrn[model.Item](u)
	return it
}

// GetItemsByURN resolves a list of item URNs to their items, skipping any that
// don't resolve. The frontend passes URN strings (urn.URN serializes as one).
func (c *Catalog) GetItemsByURN(urns []urn.URN) []*model.Item {
	out := make([]*model.Item, 0, len(urns))
	for _, u := range urns {
		if it, ok := models.ResolveUrn[model.Item](u); ok {
			out = append(out, it)
		}
	}

	return out
}
