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

// GradeOrder lists item grades from common to rare, for the grade filter.
var GradeOrder = []string{"white", "green", "blue", "yellow", "red", "purple"}

// MarketCategoryWithCount is one central-market category (or sub-category) with
// its item count — the item source's navigation structure.
type MarketCategoryWithCount struct {
	ID            uint32                    `json:"id"`
	Name          string                    `json:"name"`
	Count         int                       `json:"count"`
	SubCategories []MarketCategoryWithCount `json:"subCategories,omitempty"`
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

// BindingTypes isn't called at runtime - it exists purely so these model
// types stay referenced, keeping the Wails TS generator emitting them.
type BindingTypes struct {
	Zone           *model.Zone           `json:"zone,omitempty"`
	WorldRegion    *model.WorldRegion    `json:"worldRegion,omitempty"`
	Territory      *model.Territory      `json:"territory,omitempty"`
	KnowledgeTheme *model.KnowledgeTheme `json:"knowledgeTheme,omitempty"`
	KnowledgeEntry *model.KnowledgeEntry `json:"knowledgeEntry,omitempty"`
	Character      *model.Character      `json:"character,omitempty"`
}

// Types anchors model-type generation for the frontend bindings (see BindingTypes).
func (c *Catalog) Types() BindingTypes { return BindingTypes{} }
