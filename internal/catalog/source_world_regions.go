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
	Nodes       []model.WorldNode   `json:"-"`

	TerritoriesByURN   map[urn.URN]*model.Territory     `json:"-"` // territory urn -> territory
	RegionsByURN       map[urn.URN]*model.WorldRegion   `json:"-"` // region urn -> region
	TerritoryToRegions map[urn.URN][]*model.WorldRegion `json:"-"` // territory urn -> members, sorted by name

	ParentNodesByURN map[urn.URN]*model.WorldNode `json:"-"` // child node urn -> parent node

	// regionVariants groups phase variants of a place, keyed by the canonical
	// region's urn (from VariantOf); only multi-record places have an entry.
	regionVariants map[urn.URN][]*model.WorldRegion

	// RegionNPCs maps a region urn to the NPCs spawning there (deduped, sorted by
	// name). Built in Load from the NPC source, which loads first.
	RegionNPCs map[urn.URN][]*model.NPC `json:"-"`

	NodeStore *models.Store[model.WorldNode] `json:"-"`
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

func (s *WorldRegionSource) GetSourceKind() sources.SourceKind {
	return s.Kind
}

func (s *WorldRegionSource) Load() error {
	var world model.World
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "world.json"), &world); err != nil {
		return errors.Wrap(err, "read world.json")
	}

	s.Territories = world.Territories
	s.Regions = world.Regions
	s.Nodes = world.Nodes

	s.ParentNodesByURN = make(map[urn.URN]*model.WorldNode)

	s.NodeStore = models.NewStore[model.WorldNode](
		len(world.Nodes),
		func(u urn.URN) bool {
			return u.Domain == urn.World.Domain() && u.Kind == "node"
		},
	)

	for i, n := range s.Nodes {
		if err := s.NodeStore.Add(n.GetURN(), &s.Nodes[i]); err != nil {
			return fmt.Errorf("registering node %s: %w", n.GetURN(), err)
		}
	}

	models.RegisterStore(s.NodeStore)

	s.NodeStore.AddHook(
		func(node *model.WorldNode) error {
			if node.Children == nil {
				return nil
			}

			for _, u := range node.Children.URNs {
				s.ParentNodesByURN[u] = node
			}

			return nil
		},
	)

	s.TerritoriesByURN = make(map[urn.URN]*model.Territory, len(s.Territories))
	for i := range s.Territories {
		t := &s.Territories[i]
		s.TerritoriesByURN[t.GetURN()] = t
	}

	s.RegionsByURN = make(map[urn.URN]*model.WorldRegion, len(s.Regions))
	s.TerritoryToRegions = make(map[urn.URN][]*model.WorldRegion)
	for i := range s.Regions {
		r := &s.Regions[i]
		s.RegionsByURN[r.GetURN()] = r
		if r.Territory != nil {
			s.TerritoryToRegions[r.Territory.URN] = append(s.TerritoryToRegions[r.Territory.URN], r)
		}
	}

	// phase-variant groups by canonical region urn (VariantOf from world.json)
	s.regionVariants = make(map[urn.URN][]*model.WorldRegion)
	for i := range s.Regions {
		r := &s.Regions[i]
		if r.VariantOf != 0 {
			canon := regionURN(r.VariantOf)
			if len(s.regionVariants[canon]) == 0 {
				if cr := s.RegionsByURN[canon]; cr != nil {
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
	s.RegionNPCs = make(map[urn.URN][]*model.NPC)
	for _, n := range npcs {
		regionSeen := map[urn.URN]bool{}
		for _, sp := range n.Spawns {
			if sp.Region == nil {
				continue
			}
			ru := sp.Region.URN
			if !regionSeen[ru] {
				regionSeen[ru] = true
				s.RegionNPCs[ru] = append(s.RegionNPCs[ru], n)
			}
		}
	}
	for _, ns := range s.RegionNPCs {
		sort.Slice(ns, func(i, j int) bool { return ns[i].Name < ns[j].Name })
	}
}

// regionURN bridges extractor data that still exposes plain region keys
// (WarehouseGroup, VariantOf, NPCSpawn.Region) to the urn-keyed indexes.
func regionURN(key int) urn.URN {
	return urn.World.New("region", key)
}

func territoryURN(index int) urn.URN {
	return urn.World.New("territory", index)
}

// RegionByURN resolves a region by its urn (urn::world:region:<key>).
func (s *WorldRegionSource) RegionByURN(u urn.URN) *model.WorldRegion {
	return s.RegionsByURN[u]
}

// NodeByURN resolves a worldmap node by its urn (urn::world:node:<key>).
func (s *WorldRegionSource) NodeByURN(u urn.URN) *model.WorldNode {
	if n, ok := models.ResolveUrn[model.WorldNode](u); ok {
		return n
	}
	return nil
}

// RegionTerritory returns a region's territory, or nil.
func (s *WorldRegionSource) RegionTerritory(r *model.WorldRegion) *model.Territory {
	if r == nil || r.Territory == nil {
		return nil
	}
	return s.TerritoriesByURN[r.Territory.URN]
}

// WarehouseGroup resolves a place's warehouse/transport group to regions — the
// other storages it links to.
func (s *WorldRegionSource) WarehouseGroup(r *model.WorldRegion) []*model.WorldRegion {
	if r == nil || len(r.WarehouseGroup) == 0 {
		return nil
	}
	out := make([]*model.WorldRegion, 0, len(r.WarehouseGroup))
	for _, k := range r.WarehouseGroup {
		if t := s.RegionByURN(regionURN(k)); t != nil {
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
	canon := r.GetURN()
	if r.VariantOf != 0 {
		canon = regionURN(r.VariantOf)
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
		return s.RegionNPCs[r.GetURN()]
	}
	seen := map[uint32]bool{}
	var out []*model.NPC
	for _, vr := range group {
		for _, n := range s.RegionNPCs[vr.GetURN()] {
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
		regions := s.TerritoryToRegions[t.GetURN()]
		if len(regions) == 0 {
			continue
		}
		s.navigation.Children = append(
			s.navigation.Children, sources.SourceNavigationNodeSimple{
				Id:    strconv.Itoa(t.Index),
				URN:   t.GetURN().String(),
				Title: t.Name,
				Count: len(regions),
			},
		)
	}

	return *s.navigation
}

func (s *WorldRegionSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	v := s.RegionByURN(ref)
	if v == nil {
		return nil
	}
	return &sources.SourceEntry[*model.WorldRegion]{
		Type:  s.Kind,
		URN:   v.GetURN().String(),
		Value: v,
	}
}

func (s *WorldRegionSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	v := s.RegionByURN(ref)
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
		npcUrns := make([]string, len(npcs))
		for i, n := range npcs {
			npcUrns[i] = n.GetURN().String()
		}
		extra["npcs"] = npcUrns
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
	return s.TerritoryToRegions[territoryURN(idx)]
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
			URN:   it.GetURN().String(),
			Title: it.Name,
		}
		if t := s.RegionTerritory(it); t != nil {
			out[i].Subtitle = t.Name
		}
	}

	return out
}

type NodeInfoRef struct {
	*model.WorldNode
	Parent *model.WorldNode `json:"parentNode"`
}

// GetNodesByUrn resolves Node URNs
func (c *Catalog) GetNodesByUrn(urns []urn.URN) []NodeInfoRef {
	nodes := models.ResolveUrns[model.WorldNode](urns)
	output := make([]NodeInfoRef, 0, len(nodes))
	for _, node := range nodes {
		if node == nil {
			continue
		}
		n := NodeInfoRef{WorldNode: node}
		if parent, ok := WorldRegions.ParentNodesByURN[node.GetURN()]; ok {
			n.Parent = parent
		}
		output = append(output, n)
	}
	return output
}
