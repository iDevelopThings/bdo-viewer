package catalog

import (
	"fmt"
	"log"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"
)

// GrindRegion is a monster-zone main-category (region) — its display name and id
// (the nav child key / List Category filter).
type GrindRegion struct {
	Name string
	ID   uint32
}

type GrindSpotSource struct {
	*sources.BaseSource

	Store *models.Store[model.Zone] `json:"-"`

	// Regions are the distinct main-categories, sorted by name — the nav structure.
	Regions *models.View[model.Zone, []GrindRegion] `json:"-"`
}

var (
	_ sources.Source = (*GrindSpotSource)(nil)

	GrindSpots *GrindSpotSource
)

func NewGrindSpotSource() *GrindSpotSource {
	GrindSpots = &GrindSpotSource{
		BaseSource: &sources.BaseSource{
			Kind:  sources.GrindSpot,
			URN:   sources.NewSourceURN(urn.GrindSpot, "", ""),
			Sorts: []sources.SortOption{{Key: "name", Label: "Name"}},
		},
	}

	return GrindSpots
}

func (s *GrindSpotSource) GetSourceKind() sources.SourceKind { return s.Kind }

// Load reads zones.json (Monster Zone Info). Missing/invalid = no zones.
func (s *GrindSpotSource) Load() error {
	var zones []model.Zone
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "zones.json"), &zones); err != nil {
		return errors.Wrap(err, "read zones.json")
	}

	s.Store = models.NewStore[model.Zone](len(zones), func(u urn.URN) bool { return u.Domain == urn.GrindSpot.Domain() })
	for i := range zones {
		z := &zones[i]
		if err := s.Store.Add(z.GetURN(), z); err != nil {
			return err
		}
	}

	s.Regions = models.NewView(s.Store, func(all []*model.Zone) []GrindRegion {
		seen := map[string]bool{}
		var regions []GrindRegion
		for _, z := range all {
			if z.MainCategory != nil && z.MainCategory.Name != "" && !seen[z.MainCategory.Name] {
				seen[z.MainCategory.Name] = true
				regions = append(regions, GrindRegion{Name: z.MainCategory.Name, ID: z.MainCategory.ID})
			}
		}
		sort.Slice(regions, func(i, j int) bool { return regions[i].Name < regions[j].Name })
		return regions
	})

	models.RegisterStore(s.Store)

	return nil
}

func (s *GrindSpotSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	regions := s.Regions.Get()
	nav := sources.SourceNavigationNodeSimple{
		Id:       "grindspot",
		Title:    "Grind Spots",
		Children: make([]sources.SourceNavigationNodeSimple, 0, len(regions)),
	}
	for _, region := range regions {
		nav.Children = append(nav.Children, sources.SourceNavigationNodeSimple{
			Id:    strconv.Itoa(int(region.ID)),
			Title: region.Name,
		})
	}

	return nav
}

func (s *GrindSpotSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	zone, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, zone, ok)
}

func (s *GrindSpotSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	zone, ok := s.Store.Get(ref)
	if !ok {
		return false
	}

	data := *outDetails
	data[string(s.Kind)] = zone

	return true
}

func (s *GrindSpotSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	var key uint32
	if params.Category != "" {
		parsedKey, err := strconv.ParseUint(params.Category, 10, 32)
		if err != nil {
			log.Printf("List: invalid category %s: %v", params.Category, err)
			return nil
		}
		key = uint32(parsedKey)
	}

	pass := func(it *model.Zone) bool {
		if key > 0 && (it.MainCategory == nil || it.MainCategory.ID != key) {
			return false
		}

		return true
	}

	name := func(it *model.Zone) string { return it.Name }
	items := FilterAndRank(
		s.Store.All(),
		params.Query,
		name,
		pass,
		NameLess(name, params.SortDir),
	)

	out := make([]sources.ListSourceEntry, len(items))
	for i, it := range items {
		out[i] = sources.ListSourceEntry{
			URN:   urn.GrindSpot.New(it.Key).String(),
			Title: it.Name,
		}
		if it.SheetAP > 0 || it.SheetDP > 0 {
			out[i].Subtitle = fmt.Sprintf("AP %d / DP %d", it.SheetAP, it.SheetDP)
		}
	}

	return out
}
