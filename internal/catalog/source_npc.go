package catalog

import (
	"path/filepath"
	"strings"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
	"github.com/idevelopthings/bdo-data-extractor/src/utils"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"
)

type NpcSource struct {
	*sources.BaseSource

	navigation *sources.SourceNavigationNodeSimple

	// Heavy fields are json:"-" — GetAllSources only ships BaseSource to the frontend.
	Store *models.Store[model.NPC] `json:"-"`

	// ByName maps an NPC's (English) name to every NPC with it — a vendor name
	// like "Patrigio" resolves to one NPC per town.
	ByName *models.View[model.NPC, map[string][]*model.NPC] `json:"-"`

	// Towns maps an NPC id to the distinct spawn-region names it appears in.
	Towns *models.View[model.NPC, map[uint32][]string] `json:"-"`
}

var (
	_ sources.Source = (*NpcSource)(nil)

	Npcs *NpcSource
)

func NewNpcSource() *NpcSource {
	Npcs = &NpcSource{
		BaseSource: &sources.BaseSource{
			Kind:  sources.Npc,
			URN:   sources.NewSourceURN(urn.NPC, "", ""),
			Sorts: []sources.SortOption{{Key: "name", Label: "Name"}},
		},
	}

	return Npcs
}

func (s *NpcSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *NpcSource) Load() error {
	var npcs []model.NPC
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "npcs.json"), &npcs); err != nil {
		return errors.Wrap(err, "read npcs.json")
	}

	s.Store = models.NewStore[model.NPC](len(npcs), func(u urn.URN) bool { return u.Domain == urn.NPC.Domain() })
	for i := range npcs {
		n := &npcs[i]
		if err := s.Store.Add(n.GetURN(), n); err != nil {
			return err
		}
	}

	s.ByName = models.NewView(s.Store, func(all []*model.NPC) map[string][]*model.NPC {
		byName := make(map[string][]*model.NPC)
		for _, n := range all {
			if n.Name != "" {
				byName[n.Name] = append(byName[n.Name], n)
			}
		}
		return byName
	})

	s.Towns = models.NewView(s.Store, func(all []*model.NPC) map[uint32][]string {
		towns := make(map[uint32][]string)
		for _, n := range all {
			for _, spawn := range n.Spawns {
				if spawn.RegionName != "" {
					towns[n.ID] = utils.AppendUnique(towns[n.ID], spawn.RegionName)
				}
			}
		}
		return towns
	})

	models.RegisterStore(s.Store)

	return nil
}

func (s *NpcSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	if s.navigation != nil {
		return *s.navigation
	}

	s.navigation = &sources.SourceNavigationNodeSimple{
		Id:    string(s.Kind),
		Title: "NPCs",
		Children: []sources.SourceNavigationNodeSimple{
			{Id: "Vendors", Title: "Vendors"},
		},
	}

	return *s.navigation
}

func (s *NpcSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	npc, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, npc, ok)
}

func (s *NpcSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	npc, ok := s.Store.Get(ref)
	if !ok {
		return false
	}

	data := *outDetails
	data[string(s.Kind)] = npc

	entries := Knowledge.NpcEntries[urn.Character.New(utils.Slug(npc.Name))]
	data["knowledge"] = map[string]any{
		"entries": entries,
	}

	return true
}

func (s *NpcSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	pass := func(it *model.NPC) bool {
		if params.Category == "Vendors" {
			if _, ok := Items.ItemVendors[it.ID]; !ok {
				return false
			}
		}

		return true
	}

	name := func(it *model.NPC) string { return it.Name }
	items := FilterAndRank(
		s.Store.All(),
		params.Query,
		name,
		pass,
		NameLess(name, params.SortDir),
	)

	towns := s.Towns.Get()
	out := make([]sources.ListSourceEntry, len(items))
	for i, it := range items {
		out[i] = sources.ListSourceEntry{
			URN:   it.GetURN().String(),
			Title: it.Name,
		}

		if t, ok := towns[it.ID]; ok {
			out[i].Subtitle = strings.Join(t, ", ")
		}
	}

	return out
}
