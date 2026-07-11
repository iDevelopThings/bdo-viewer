package catalog

import (
	"path/filepath"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// CharacterSource is the first source to follow the intended convention: it owns
// its data (loaded in Load) and resolves through a shared models.Store[Character]
// rather than a hand-rolled catalog map — so every urn::character:<slug> resolves
// via models.Resolve, including the Character refs carried by knowledge entries.
type CharacterSource struct {
	*sources.BaseSource

	Store *models.Store[model.Character] `json:"-"`
}

var (
	_ sources.Source = (*CharacterSource)(nil)

	Characters *CharacterSource
)

func NewCharacterSource() *CharacterSource {
	Characters = &CharacterSource{
		BaseSource: &sources.BaseSource{
			Kind:  sources.Character,
			URN:   sources.NewSourceURN(urn.Character, "", ""),
			Sorts: []sources.SortOption{{Key: "name", Label: "Name"}},
		},
	}

	return Characters
}

func (s *CharacterSource) Load() error {
	var chars []model.Character
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "characters.json"), &chars); err != nil {
		return err
	}

	s.Store = models.NewStore[model.Character](len(chars), func(u urn.URN) bool { return u.Domain == urn.Character.Domain() })
	for i := range chars {
		c := &chars[i]
		if err := s.Store.Add(c.GetURN(), c); err != nil {
			return err
		}
	}
	models.RegisterStore(s.Store)

	return nil
}

func (s *CharacterSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *CharacterSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	return sources.SourceNavigationNodeSimple{Id: string(s.Kind), Title: "Characters"}
}

func (s *CharacterSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	c, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, c, ok)
}

func (s *CharacterSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	c, ok := s.Store.Get(ref)
	if !ok {
		return false
	}
	(*outDetails)[string(s.Kind)] = c
	return true
}

func (s *CharacterSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	name := func(c *model.Character) string { return c.Name }
	matched := FilterAndRank(
		s.Store.All(),
		params.Query,
		name,
		func(c *model.Character) bool { return c.Name != "" },
		NameLess(name, params.SortDir),
	)
	out := make([]sources.ListSourceEntry, len(matched))
	for i, c := range matched {
		out[i] = sources.ListSourceEntry{
			URN:      c.GetURN().String(),
			Title:    c.Name,
			Subtitle: string(c.Kind),
		}
	}

	return out
}
