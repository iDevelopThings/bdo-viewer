// Package catalog wires the extracted BDO dataset into the viewer. Each dataset
// is owned by a self-contained source (internal/catalog/source_*.go) that loads
// its own JSON into a models.Store; Catalog itself is a thin facade — the init
// entry point (New), the static asset server (ServeHTTP), and the few explicit
// query methods the frontend binds directly (Item / GetItemsByURN /
// GetNpcsByURN / GetItemVendorData).
package catalog

import (
	"bdo-viewer/internal/config"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

// MarketCategoryWithCount is one central-market category (or sub-category) with
// its item count — the item source's navigation structure.
type MarketCategoryWithCount struct {
	ID            uint32                    `json:"id"`
	Name          string                    `json:"name"`
	Count         int                       `json:"count"`
	SubCategories []MarketCategoryWithCount `json:"subCategories,omitempty"`
}

// BindingTypes isn't called at runtime - it exists purely so these model
// types stay referenced, keeping the Wails TS generator emitting them.
type BindingTypes struct {
	Zone           *model.Zone           `json:"zone,omitempty"`
	WorldRegion    *model.WorldRegion    `json:"worldRegion,omitempty"`
	Territory      *model.Territory      `json:"territory,omitempty"`
	KnowledgeTheme *model.KnowledgeTheme `json:"knowledgeTheme,omitempty"`
	KnowledgeEntry *model.KnowledgeEntry `json:"knowledgeEntry,omitempty"`
	Character      *model.Character      `json:"character,omitempty"`
	CrystalRules   *model.CrystalRules   `json:"crystalRules,omitempty"`
}

// Catalog is the thin facade the frontend binds against. It owns no dataset —
// each source owns its own — and reads the data dir live from config so a
// re-extraction to a new location is picked up without a restart.
type Catalog struct{}

var Instance *Catalog

func New() (*Catalog, error) {
	Instance = &Catalog{}
	return Instance, nil
}

// DataDir returns the resolved data directory (for loading map/image assets).
func (c *Catalog) DataDir() string { return config.GetExtractedDataDir() }

// Types anchors model-type generation for the frontend bindings (see BindingTypes).
func (c *Catalog) Types() BindingTypes {
	return BindingTypes{}
}

// GetWorldNodes returns every worldmap node (towns, gateways, farms and their
// co-located sub-nodes) from world.json. Each carries its urn, position, kind,
// main flag, contribution cost and child refs — the frontend map's "our data"
// source, an alternative to the bundled bdolytics nodes.
func (c *Catalog) GetWorldNodes() []model.WorldNode {
	return WorldRegions.Nodes
}

// GetWorldTerritories returns the world's territories (Balenos, Serendia, …), so
// the frontend map can resolve a node's territory ref to a name.
func (c *Catalog) GetWorldTerritories() []model.Territory {
	return WorldRegions.Territories
}

// GetWorldRegions returns every map region from world.json with its position,
// extra worldmap marks, world-space AABB bounds and NPC/monster spawn placements
// — for drawing region overlays (bounds boxes, spawn points) on the map.
func (c *Catalog) GetWorldRegions() []model.WorldRegion {
	return WorldRegions.Regions
}
