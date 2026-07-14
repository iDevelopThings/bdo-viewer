package catalog

import (
	"log"
	"path/filepath"
	"sort"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/stats"
	"bdo-viewer/internal/util"
)

// KnowledgeSource owns the knowledge/ecology dataset (mentaltheme tree +
// mentalcard entries) and the reverse indexes siblings read: item URN -> themes/
// entries that link to it, character URN -> entries about it. All indexes are
// public fields keyed by URN so cross-source access is a plain map read.
type KnowledgeSource struct {
	*sources.BaseSource

	navigation *sources.SourceNavigationNodeSimple

	Themes  *models.Store[model.KnowledgeTheme] `json:"-"`
	Entries *models.Store[model.KnowledgeEntry] `json:"-"`

	RootThemes    []*model.KnowledgeTheme             `json:"-"` // top-level, sorted by name
	ThemeChildren map[urn.URN][]*model.KnowledgeTheme `json:"-"` // parent URN -> child themes
	ThemeEntries  map[urn.URN][]*model.KnowledgeEntry `json:"-"` // theme URN -> direct entries
	SubtreeCount  map[urn.URN]int                     `json:"-"` // theme URN -> entries in its subtree

	ItemThemes  map[urn.URN][]*model.KnowledgeTheme `json:"-"` // item URN -> themes linking to it
	ItemEntries map[urn.URN][]*model.KnowledgeEntry `json:"-"` // item URN -> entries linking to it
	NpcEntries  map[urn.URN][]*model.KnowledgeEntry `json:"-"` // character URN -> entries about it
}

var (
	_ sources.Source = (*KnowledgeSource)(nil)

	Knowledge *KnowledgeSource
)

func NewKnowledgeSource() *KnowledgeSource {
	Knowledge = &KnowledgeSource{
		BaseSource: &sources.BaseSource{
			Kind: sources.Knowledge,
			URN:  sources.NewSourceURN(urn.Knowledge, "", "entry"),
		},
	}

	return Knowledge
}

func (s *KnowledgeSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *KnowledgeSource) Load() error {
	var kd struct {
		Themes  []model.KnowledgeTheme `json:"themes"`
		Entries []model.KnowledgeEntry `json:"entries"`
	}
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "knowledge.json"), &kd); err != nil {
		return errors.Wrap(err, "read knowledge.json")
	}

	isKnowledge := func(u urn.URN) bool { return u.Domain == urn.Knowledge.Domain() }
	s.Themes = models.NewStore[model.KnowledgeTheme](len(kd.Themes), isKnowledge)
	s.Entries = models.NewStore[model.KnowledgeEntry](len(kd.Entries), isKnowledge)

	s.RootThemes = []*model.KnowledgeTheme{}
	s.ThemeChildren = map[urn.URN][]*model.KnowledgeTheme{}
	s.ThemeEntries = map[urn.URN][]*model.KnowledgeEntry{}
	s.SubtreeCount = map[urn.URN]int{}
	s.ItemThemes = map[urn.URN][]*model.KnowledgeTheme{}
	s.ItemEntries = map[urn.URN][]*model.KnowledgeEntry{}
	s.NpcEntries = map[urn.URN][]*model.KnowledgeEntry{}

	for i := range kd.Themes {
		th := &kd.Themes[i]
		if err := s.Themes.Add(th.GetURN(), th); err != nil {
			return err
		}
		if th.Item != nil {
			s.ItemThemes[th.Item.URN] = append(s.ItemThemes[th.Item.URN], th)
		}
	}

	for i := range kd.Entries {
		e := &kd.Entries[i]
		e.Image = s.IconPath(e) // precompute icon path for list rows
		if err := s.Entries.Add(e.GetURN(), e); err != nil {
			return err
		}
		if e.Theme != nil {
			s.ThemeEntries[e.Theme.URN] = append(s.ThemeEntries[e.Theme.URN], e)
		}
		if e.Item != nil {
			s.ItemEntries[e.Item.URN] = append(s.ItemEntries[e.Item.URN], e)
		}
		if e.Character != nil {
			s.NpcEntries[e.Character.URN] = append(s.NpcEntries[e.Character.URN], e)
		}
	}

	models.RegisterStore(s.Themes)
	models.RegisterStore(s.Entries)

	// tree links: children by parent URN, roots (no parent or missing parent)
	for _, th := range s.Themes.All() {
		if th.Parent != nil {
			if _, ok := s.Themes.Get(th.Parent.URN); ok {
				s.ThemeChildren[th.Parent.URN] = append(s.ThemeChildren[th.Parent.URN], th)
				continue
			}
		}
		s.RootThemes = append(s.RootThemes, th)
	}
	// Drop childless top-level themes: in-game a category always has subcategories,
	// so these are empty/deprecated ("Bosses (Calpheon)") or catch-all ("None")
	// nodes the game doesn't surface. Their entries remain in "All Knowledge".
	kept := s.RootThemes[:0]
	for _, r := range s.RootThemes {
		if len(s.ThemeChildren[r.GetURN()]) > 0 {
			kept = append(kept, r)
		}
	}
	s.RootThemes = kept

	byName := func(a, b *model.KnowledgeTheme) bool { return a.Name < b.Name }
	sortThemes(s.RootThemes, byName)
	for k := range s.ThemeChildren {
		sortThemes(s.ThemeChildren[k], byName)
	}
	for k := range s.ThemeEntries {
		es := s.ThemeEntries[k]
		sort.Slice(es, func(i, j int) bool { return es[i].Name < es[j].Name })
	}

	// precompute subtree entry counts (post-order over the forest)
	for _, r := range s.RootThemes {
		s.countSubtree(r.GetURN())
	}

	return nil
}

func (s *KnowledgeSource) countSubtree(u urn.URN) int {
	n := len(s.ThemeEntries[u])
	for _, ch := range s.ThemeChildren[u] {
		n += s.countSubtree(ch.GetURN())
	}
	s.SubtreeCount[u] = n

	return n
}

func sortThemes(list []*model.KnowledgeTheme, less func(a, b *model.KnowledgeTheme) bool) {
	sort.Slice(list, func(i, j int) bool { return less(list[i], list[j]) })
}

// Theme returns the theme with the given URN, or nil.
func (s *KnowledgeSource) Theme(u urn.URN) *model.KnowledgeTheme {
	th, _ := s.Themes.Get(u)
	return th
}

// Entry returns the knowledge entry (card) with the given URN, or nil.
func (s *KnowledgeSource) Entry(u urn.URN) *model.KnowledgeEntry {
	e, _ := s.Entries.Get(u)
	return e
}

// ThemePath returns the root->theme breadcrumb chain for a theme URN.
func (s *KnowledgeSource) ThemePath(u urn.URN) []*model.KnowledgeTheme {
	var chain []*model.KnowledgeTheme
	for th := s.Theme(u); th != nil; {
		chain = append(chain, th)
		if th.Parent == nil {
			break
		}
		th = s.Theme(th.Parent.URN)
	}
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}

	return chain
}

// SubtreeEntries returns every entry in a theme's subtree (sorted by name).
func (s *KnowledgeSource) SubtreeEntries(u urn.URN) []*model.KnowledgeEntry {
	var out []*model.KnowledgeEntry
	var walk func(k urn.URN)
	walk = func(k urn.URN) {
		out = append(out, s.ThemeEntries[k]...)
		for _, ch := range s.ThemeChildren[k] {
			walk(ch.GetURN())
		}
	}
	walk(u)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	return out
}

// ItemKnowledge returns the themes and entries whose knowledge item is the given
// item URN (the inverse of an entry/theme's item link).
func (s *KnowledgeSource) ItemKnowledge(item urn.URN) ([]*model.KnowledgeTheme, []*model.KnowledgeEntry) {
	return s.ItemThemes[item], s.ItemEntries[item]
}

// IconPath returns the URL an entry's card image is served at (see Catalog.ServeHTTP).
func (s *KnowledgeSource) IconPath(e *model.KnowledgeEntry) string {
	if e == nil || e.Image == "" {
		return ""
	}

	return "/icons/knowledge_icons/" + filepath.ToSlash(e.Image)
}

func (s *KnowledgeSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	if s.navigation != nil {
		return *s.navigation
	}

	s.navigation = &sources.SourceNavigationNodeSimple{
		Id:       string(s.Kind),
		Title:    "Knowledge",
		Children: make([]sources.SourceNavigationNodeSimple, 0),
	}

	var buildNode func(theme *model.KnowledgeTheme) sources.SourceNavigationNodeSimple
	buildNode = func(theme *model.KnowledgeTheme) sources.SourceNavigationNodeSimple {
		u := theme.GetURN()
		n := sources.SourceNavigationNodeSimple{
			Id:    u.String(),
			URN:   u.String(),
			Title: theme.Name,
			Count: s.SubtreeCount[u],
		}

		if n.Count > 0 {
			n.Children = make([]sources.SourceNavigationNodeSimple, 0)
			for _, sub := range s.ThemeChildren[u] {
				n.Children = append(n.Children, buildNode(sub))
			}
		}
		return n
	}
	for _, theme := range s.RootThemes {
		s.navigation.Children = append(s.navigation.Children, buildNode(theme))
	}

	return *s.navigation
}

func (s *KnowledgeSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	switch ref.Kind {
	case "theme":
		theme := s.Theme(ref)
		if theme == nil {
			return nil
		}
		return &sources.SourceEntry[*model.KnowledgeTheme]{
			Type:  s.Kind,
			URN:   ref.String(),
			Value: theme,
		}
	case "entry":
		entry := s.Entry(ref)
		if entry == nil {
			return nil
		}
		return &sources.SourceEntry[*model.KnowledgeEntry]{
			Type:  s.Kind,
			URN:   ref.String(),
			Value: entry,
		}
	default:
		return nil
	}
}

func (s *KnowledgeSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	data := *outDetails
	switch ref.Kind {
	case "theme":
		theme := s.Theme(ref)
		if theme == nil {
			return false
		}
		data[string(s.Kind)] = theme
		data["knowledgeTheme"] = theme
		data["knowledgeExtra"] = map[string]any{
			"breadcrumbs": s.ThemePath(ref),
			"themes":      s.ThemeChildren[ref],
			"entries":     s.SubtreeEntries(ref),
		}
		return true
	case "entry":
		entry := s.Entry(ref)
		if entry == nil {
			return false
		}
		data[string(s.Kind)] = entry
		data["stats"] = s.GetStats(ref, 0, 0)
		var breadcrumbs []*model.KnowledgeTheme
		if entry.Theme != nil {
			breadcrumbs = s.ThemePath(entry.Theme.URN)
		}
		data["knowledgeExtra"] = map[string]any{
			"breadcrumbs": breadcrumbs,
		}
		return true
	default:
		return false
	}
}

func (s *KnowledgeSource) GetStats(ref urn.URN, _ int, _ int) []stats.StatGroup {
	if ref.Kind != "entry" {
		return nil
	}
	entry := s.Entry(ref)
	if entry == nil {
		return nil
	}

	b := stats.NewStatBuilder()

	card := b.Section(stats.StatGroupKindCard)

	minV, midV, maxV := entry.FavourRange()
	card.Range("Amity Favor", minV, maxV, midV)
	card.NumberNonZero("Interest", entry.Interest)

	return b.Build()
}

func (s *KnowledgeSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	// PathParts holds the theme URN chain; the last element is the current node.
	pathIds := params.PathParts

	var root *model.KnowledgeTheme
	if len(pathIds) > 0 {
		if u, err := urn.Parse(pathIds[len(pathIds)-1]); err == nil {
			root = s.Theme(u)
		}

		if root == nil {
			log.Printf("List: root theme not found for path %v", pathIds)
			return []sources.ListSourceEntry{}
		}
	}

	var entries []*model.KnowledgeEntry
	if root == nil {
		entries = s.Entries.All()
	} else {
		var appendEntries func(theme *model.KnowledgeTheme)
		appendEntries = func(theme *model.KnowledgeTheme) {
			entries = append(entries, s.ThemeEntries[theme.GetURN()]...)
			for _, child := range s.ThemeChildren[theme.GetURN()] {
				appendEntries(child)
			}
		}
		appendEntries(root)
	}

	items := FilterAndRank(
		entries,
		params.Query,
		func(it *model.KnowledgeEntry) string { return it.Name },
		func(it *model.KnowledgeEntry) bool { return true },
		nil,
	)

	out := make([]sources.ListSourceEntry, len(items))
	for i, it := range items {
		out[i] = sources.ListSourceEntry{
			ID:    it.Key,
			URN:   it.GetURN().String(),
			Title: it.Name,
		}
	}

	return out
}
