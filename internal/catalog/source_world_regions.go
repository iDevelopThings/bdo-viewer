package catalog

import (
	"log"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"
)

// WorldRegionSource owns world.json's geographic regions and territories. The
// navigation tree lists the territories (Balenos, Serendia, …); the list under a
// territory shows its regions. Region keys, territory membership, warehouse
// groups and phase variants are all indexed here; the region->NPC index is built
// from the (already-loaded) NPC source.
type WorldRegionSource struct {
	*sources.BaseSource

	navigation *sources.SourceNavigationNodeSimple

	// Heavy fields json:"-" — GetAllSources only ships BaseSource to the frontend.
	Territories []model.Territory   `json:"-"`
	Regions     []model.WorldRegion `json:"-"`

	TerritoriesByID    map[uint32]*model.Territory     `json:"-"`
	RegionsByID        map[uint32]*model.WorldRegion   `json:"-"`
	TerritoryToRegions map[uint32][]*model.WorldRegion `json:"-"` // territory index -> members, sorted by name

	// regionVariants groups phase variants of a place, keyed by the canonical
	// region's key (VariantOf); only multi-record places have an entry.
	regionVariants map[uint32][]*model.WorldRegion

	// RegionNPCs maps a region key to the NPCs spawning there (deduped, sorted by
	// name). Built in Load from the NPC source, which loads first.
	RegionNPCs map[uint32][]*model.NPC `json:"-"`
}

var (
	_ sources.Source = (*WorldRegionSource)(nil)

	WorldRegions *WorldRegionSource
)

func NewWorldRegionSource() *WorldRegionSource {
	WorldRegions = &WorldRegionSource{
		BaseSource: &sources.BaseSource{
			Kind:  sources.Region,
			URN:   sources.NewSourceURN(urn.World, "region", "region"),
			Sorts: []sources.SortOption{{Key: "name", Label: "Name"}},
		},
	}

	return WorldRegions
}

func (s *WorldRegionSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *WorldRegionSource) Load() error {
	var world model.World
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "world.json"), &world); err != nil {
		return errors.Wrap(err, "read world.json")
	}

	s.Territories = world.Territories
	s.Regions = world.Regions

	s.TerritoriesByID = make(map[uint32]*model.Territory, len(s.Territories))
	for i := range s.Territories {
		t := &s.Territories[i]
		s.TerritoriesByID[uint32(t.Index)] = t
	}

	s.RegionsByID = make(map[uint32]*model.WorldRegion, len(s.Regions))
	s.TerritoryToRegions = make(map[uint32][]*model.WorldRegion)
	for i := range s.Regions {
		r := &s.Regions[i]
		s.RegionsByID[uint32(r.Key)] = r
		s.TerritoryToRegions[uint32(r.Territory)] = append(s.TerritoryToRegions[uint32(r.Territory)], r)
	}

	// phase-variant groups by canonical key (VariantOf from world.json)
	s.regionVariants = make(map[uint32][]*model.WorldRegion)
	for i := range s.Regions {
		r := &s.Regions[i]
		if r.VariantOf != 0 {
			canon := uint32(r.VariantOf)
			if len(s.regionVariants[canon]) == 0 {
				if cr := s.RegionsByID[canon]; cr != nil {
					s.regionVariants[canon] = append(s.regionVariants[canon], cr)
				}
			}
			s.regionVariants[canon] = append(s.regionVariants[canon], r)
		}
	}
	for _, g := range s.regionVariants {
		sort.Slice(g, func(i, j int) bool { return g[i].Key < g[j].Key })
	}

	for _, rs := range s.TerritoryToRegions {
		sort.Slice(rs, func(i, j int) bool { return rs[i].Name < rs[j].Name })
	}

	// region NPC index (Npcs loads before this source — see auto_init order).
	s.indexNPCSpawns(Npcs.Store.All())

	return nil
}

// indexNPCSpawns fills the region NPC index from NPC spawn data.
func (s *WorldRegionSource) indexNPCSpawns(npcs []*model.NPC) {
	s.RegionNPCs = make(map[uint32][]*model.NPC)
	for _, n := range npcs {
		regionSeen := map[uint32]bool{}
		for _, sp := range n.Spawns {
			if !regionSeen[sp.Region] {
				regionSeen[sp.Region] = true
				s.RegionNPCs[sp.Region] = append(s.RegionNPCs[sp.Region], n)
			}
		}
	}
	for _, ns := range s.RegionNPCs {
		sort.Slice(ns, func(i, j int) bool { return ns[i].Name < ns[j].Name })
	}
}

// RegionByKey resolves a region key (world regions, npcs.json spawn regions,
// regions.json placements all share this key space).
func (s *WorldRegionSource) RegionByKey(key uint32) *model.WorldRegion { return s.RegionsByID[key] }

// RegionTerritory returns a region's territory, or nil.
func (s *WorldRegionSource) RegionTerritory(r *model.WorldRegion) *model.Territory {
	if r == nil {
		return nil
	}
	return s.TerritoriesByID[uint32(r.Territory)]
}

// WarehouseGroup resolves a place's warehouse/transport group to regions — the
// other storages it links to.
func (s *WorldRegionSource) WarehouseGroup(r *model.WorldRegion) []*model.WorldRegion {
	if r == nil || len(r.WarehouseGroup) == 0 {
		return nil
	}
	out := make([]*model.WorldRegion, 0, len(r.WarehouseGroup))
	for _, k := range r.WarehouseGroup {
		if t := s.RegionsByID[uint32(k)]; t != nil {
			out = append(out, t)
		}
	}
	return out
}

// RegionVariants returns every phase variant of the region's place (sorted by
// key, canonical first). Places without variants return nil.
func (s *WorldRegionSource) RegionVariants(r *model.WorldRegion) []*model.WorldRegion {
	if r == nil {
		return nil
	}
	canon := uint32(r.Key)
	if r.VariantOf != 0 {
		canon = uint32(r.VariantOf)
	}
	return s.regionVariants[canon]
}

// RegionCanonical reports whether r is its place's canonical record — the one to
// show in deduplicated lists.
func (s *WorldRegionSource) RegionCanonical(r *model.WorldRegion) bool {
	return r != nil && r.VariantOf == 0
}

// RegionNPCsFor returns the NPCs spawning at a region's place, merged across its
// phase variants (spawn data references the specific phase keys), deduped and
// sorted by name.
func (s *WorldRegionSource) RegionNPCsFor(r *model.WorldRegion) []*model.NPC {
	if r == nil {
		return nil
	}
	group := s.RegionVariants(r)
	if len(group) == 0 {
		return s.RegionNPCs[uint32(r.Key)]
	}
	seen := map[uint32]bool{}
	var out []*model.NPC
	for _, vr := range group {
		for _, n := range s.RegionNPCs[uint32(vr.Key)] {
			if !seen[n.ID] {
				seen[n.ID] = true
				out = append(out, n)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *WorldRegionSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	if s.navigation != nil {
		return *s.navigation
	}

	s.navigation = &sources.SourceNavigationNodeSimple{
		Id:       string(s.Kind),
		Title:    "Region",
		Children: make([]sources.SourceNavigationNodeSimple, 0),
	}

	for i := range s.Territories {
		t := &s.Territories[i]
		regions := s.TerritoryToRegions[uint32(t.Index)]
		if len(regions) == 0 {
			continue
		}
		s.navigation.Children = append(
			s.navigation.Children, sources.SourceNavigationNodeSimple{
				Id:    strconv.Itoa(t.Index),
				URN:   urn.World.New("territory", t.Index).String(),
				Title: t.Name,
				Count: len(regions),
			},
		)
	}

	return *s.navigation
}

func (s *WorldRegionSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	id, err := ref.Uint32()
	if err != nil {
		return nil
	}
	v := s.RegionByKey(id)
	if v == nil {
		return nil
	}
	return &sources.SourceEntry[*model.WorldRegion]{
		Type:  s.Kind,
		URN:   urn.World.New("region", id).String(),
		Value: v,
	}
}

func (s *WorldRegionSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	id, err := ref.Uint32()
	if err != nil {
		return false
	}
	v := s.RegionByKey(id)
	if v == nil {
		return false
	}

	data := *outDetails
	data[string(s.Kind)] = v

	extra := map[string]any{}
	if t := s.RegionTerritory(v); t != nil {
		extra["territory"] = t
	}
	if group := s.WarehouseGroup(v); len(group) > 0 {
		names := make([]string, len(group))
		for i, t := range group {
			names[i] = t.Name
		}
		extra["warehouseGroup"] = names
	}
	if variants := s.RegionVariants(v); len(variants) > 1 {
		keys := make([]int, len(variants))
		for i, vr := range variants {
			keys[i] = vr.Key
		}
		extra["variantKeys"] = keys
	}
	if npcs := s.RegionNPCsFor(v); len(npcs) > 0 {
		npcIds := make([]uint32, len(npcs))
		for i, n := range npcs {
			npcIds[i] = n.ID
		}
		extra["npcs"] = npcIds
	}
	data["regionExtra"] = extra

	return true
}

// regionsForPath resolves a [territory] path to its regions; a nil path means
// every region.
func (s *WorldRegionSource) regionsForPath(pathIds []string) []*model.WorldRegion {
	if len(pathIds) == 0 {
		all := make([]*model.WorldRegion, 0, len(s.Regions))
		for i := range s.Regions {
			all = append(all, &s.Regions[i])
		}
		return all
	}

	idx, err := strconv.Atoi(pathIds[0])
	if err != nil {
		log.Printf("List: bad territory path %v", pathIds)
		return nil
	}
	return s.TerritoryToRegions[uint32(idx)]
}

func (s *WorldRegionSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	regions := s.regionsForPath(params.PathParts)

	name := func(it *model.WorldRegion) string { return it.Name }
	items := FilterAndRank(
		regions,
		params.Query,
		name,
		// the game stores one region record per spawn phase of a place; list only
		// the canonical one
		func(it *model.WorldRegion) bool { return s.RegionCanonical(it) },
		NameLess(name, params.SortDir),
	)

	out := make([]sources.ListSourceEntry, len(items))
	for i, it := range items {
		out[i] = sources.ListSourceEntry{
			ID:    uint32(it.Key),
			URN:   urn.World.New("region", it.Key).String(),
			Title: it.Name,
		}
		if t := s.RegionTerritory(it); t != nil {
			out[i].Subtitle = t.Name
		}
	}

	return out
}
