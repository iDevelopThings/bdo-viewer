package sources

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"

	"bdo-viewer/internal/event_reporter"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
	"github.com/idevelopthings/bdo-data-extractor/src/utils"

	"bdo-viewer/internal/stats"
)

type SourceKind string

const (
	Unknown   SourceKind = "unknown"
	Item      SourceKind = "item"
	GrindSpot SourceKind = "grindspot"
	Recipe    SourceKind = "recipe"
	Npc       SourceKind = "npc"
	Knowledge SourceKind = "knowledge"
	Region    SourceKind = "region"
	Character SourceKind = "character"
	Mastery   SourceKind = "mastery"
)

type ListSourceParams struct {
	Query       string     `json:"query,omitempty"`
	Source      SourceKind `json:"source,omitempty"`
	Category    string     `json:"category,omitempty"`
	SubCategory string     `json:"sub_category,omitempty"`
	PathParts   []string   `json:"path_parts,omitempty"`
	// Sort is a key from the source's SortOptions (see BaseSource.Sorts); empty
	// keeps the source's default (query-ranked) order. SortDir is "asc" or "desc"
	// (default asc). Each source applies these after filtering.
	Sort    string          `json:"sort,omitempty"`
	SortDir string          `json:"sort_dir,omitempty"`
	Filters json.RawMessage `json:"filters,omitempty"`
}

// SortOption is one ordering a source offers, surfaced to the frontend so the
// sort dropdown is driven by the source (items add AP/DP/etc., others just Name).
type SortOption struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}
type ListSourceEntry struct {
	ID       uint32         `json:"id"`
	URN      string         `json:"urn,omitempty"`
	Title    string         `json:"title"`
	Subtitle string         `json:"subtitle,omitempty"`
	Icon     string         `json:"icon,omitempty"`
	Extra    map[string]any `json:"extra,omitempty"`
}

type SourceNavigationNodeSimple struct {
	Id       string                       `json:"id"`
	URN      string                       `json:"urn,omitempty"`
	Title    string                       `json:"title"`
	Count    int                          `json:"count,omitempty"`
	Children []SourceNavigationNodeSimple `json:"children,omitempty"`
}
type SourceNavigationNode struct {
	Id       string                 `json:"id"`
	URN      string                 `json:"urn,omitempty"`
	Path     string                 `json:"path"`
	Source   SourceKind             `json:"source"`
	Title    string                 `json:"title"`
	Count    int                    `json:"count,omitempty"`
	Children []SourceNavigationNode `json:"children,omitempty"`
}

type BaseSource struct {
	Kind SourceKind `json:"kind"`
	URN  SourceURN  `json:"urn"`
	// Sorts are the orderings this source offers the sort dropdown. Set in the
	// source's constructor; empty means "Default" (query-ranked) only.
	Sorts []SortOption `json:"sorts,omitempty"`

	Reporter *event_reporter.EventReporter `json:"-"`
}

func (s *BaseSource) GetURN() SourceURN { return s.URN }
func (s *BaseSource) SetReporter(reporter *event_reporter.EventReporter) {
	s.Reporter = reporter
}

// GetStats is a no-op default for sources without stats; concrete sources
// that have any (Item, Knowledge) shadow it with their own implementation.
// caphrasStep is ignored by every source except Item (0 = no Caphras bonus
// applied, matching the in-game default).
func (s *BaseSource) GetStats(ref urn.URN, level int, caphrasStep int) []stats.StatGroup {
	return nil
}

type Source interface {
	SetReporter(reporter *event_reporter.EventReporter)
	Load() error
	GetSourceKind() SourceKind
	GetURN() SourceURN
	GetNavigationTree() SourceNavigationNodeSimple
	GetEntry(ref urn.URN) ISourceEntry
	GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool
	GetStats(ref urn.URN, level int, caphrasStep int) []stats.StatGroup
	List(params ListSourceParams) []ListSourceEntry
}

type SourceRegistry struct {
	sources             map[SourceKind]Source
	sourceRegisterOrder []SourceKind
}

var Registry *SourceRegistry = &SourceRegistry{
	sources:             make(map[SourceKind]Source),
	sourceRegisterOrder: make([]SourceKind, 0),
}

// LoadAll runs every source's Load() (call once at startup, after config is
// loaded). Sources still backed by the catalog return nil here today; new
// sources (character) own their data via Load — the convention we're moving to.
func (r *SourceRegistry) LoadAll(reporter *event_reporter.EventReporter) error {
	total := utils.Timed("[SOURCES] LoadAll")
	defer total()

	reporter.Phase("Loading sources")

	src := r.GetAllSources()
	for i, source := range src {
		source.SetReporter(reporter)

		reporter.Phase(fmt.Sprintf("Loading %s", source.GetSourceKind()))

		t := utils.Timed(fmt.Sprintf("[SOURCE] load %s", source.GetSourceKind()))
		if err := source.Load(); err != nil {
			t()
			return err
		}
		t()

		reporter.Progress(int64(i+1), int64(len(src)))
	}

	return nil
}

// RegisterSource adds a source to the registry. It's called from Go setup code,
// never the frontend, so it's skipped by the bindings generator — the Source
// interface parameter can't be populated by encoding/json.
//
//wails:ignore
func (r *SourceRegistry) RegisterSource(source Source) {
	r.sources[source.GetSourceKind()] = source
	r.sourceRegisterOrder = append(r.sourceRegisterOrder, source.GetSourceKind())
}
func (r *SourceRegistry) GetSource(kind SourceKind) Source {
	return r.sources[kind]
}
func (r *SourceRegistry) GetAllSources() []Source {
	allSources := make([]Source, 0, len(r.sourceRegisterOrder))
	for _, kind := range r.sourceRegisterOrder {
		if source, ok := r.sources[kind]; ok {
			allSources = append(allSources, source)
		}
	}

	return allSources
}
func (r *SourceRegistry) GetNavigationTree() []SourceNavigationNode {
	tree := make([]SourceNavigationNode, 0, len(r.sourceRegisterOrder))

	idRegex := regexp.MustCompile(`[^a-zA-Z0-9_-]`)
	sanitizeId := func(id string) string {
		return idRegex.ReplaceAllString(id, "_")
	}

	for _, source := range r.GetAllSources() {
		var build func(node SourceNavigationNodeSimple, parentPath string) SourceNavigationNode
		build = func(node SourceNavigationNodeSimple, parentPath string) SourceNavigationNode {
			n := SourceNavigationNode{
				Id:       node.Id,
				URN:      node.URN,
				Source:   source.GetSourceKind(),
				Count:    node.Count,
				Title:    node.Title,
				Children: make([]SourceNavigationNode, len(node.Children)),
			}

			if parentPath != "" {
				n.Path = parentPath + "/" + sanitizeId(node.Id)
			} else {
				n.Path = sanitizeId(node.Id)
			}

			if node.Children != nil {
				for i := range node.Children {
					n.Children[i] = build(node.Children[i], n.Path)
				}
			}

			return n
		}

		rootNode := source.GetNavigationTree()
		if rootNode.Id == "" {
			// A source with no nav root (e.g. recipes) contributes no sidebar
			// section — it still owns/serves its data, just isn't browsed.
			continue
		}
		tree = append(tree, build(rootNode, ""))
	}

	return tree
}
func (r *SourceRegistry) GetEntry(kind SourceKind, id uint32) *UntypedSourceEntry {
	if source, ok := r.sources[kind]; ok {
		return r.getEntry(source, source.GetURN().New(id))
	}

	return nil
}
func (r *SourceRegistry) GetEntryByURN(raw string) *UntypedSourceEntry {
	source, ref, ok := r.sourceFromURN(raw)
	if !ok {
		log.Printf("GetEntryByURN: unsupported urn %q", raw)
		return nil
	}

	return r.getEntry(source, ref)
}
func (r *SourceRegistry) GetEntryDetails(kind SourceKind, id uint32) map[string]any {
	if source, ok := r.sources[kind]; ok {
		return r.getEntryDetails(source, source.GetURN().New(id))
	}

	return nil
}
func (r *SourceRegistry) GetEntryDetailsByURN(raw string) map[string]any {
	source, ref, ok := r.sourceFromURN(raw)
	if !ok {
		log.Printf("GetEntryDetailsByURN: unsupported urn %q", raw)
		return nil
	}

	return r.getEntryDetails(source, ref)
}
func (r *SourceRegistry) GetStatsByURN(ref urn.URN, level int, caphrasStep int) []stats.StatGroup {
	source, ok := r.sourceForRef(ref)
	if !ok {
		log.Printf("GetStatsByURN: unsupported urn %q", ref.String())
		return nil
	}

	return source.GetStats(ref, level, caphrasStep)
}

func (r *SourceRegistry) getEntry(source Source, ref urn.URN) *UntypedSourceEntry {
	if entry := source.GetEntry(ref); entry != nil {
		return &UntypedSourceEntry{
			Type:  entry.GetType(),
			URN:   entry.GetURN(),
			Value: entry.GetValue(),
		}
	}

	return nil
}
func (r *SourceRegistry) getEntryDetails(source Source, ref urn.URN) map[string]any {
	details := make(map[string]any)
	if source.GetEntryDetails(ref, &details) {
		return details
	}

	return nil
}
func (r *SourceRegistry) ListSourceEntries(params ListSourceParams) []ListSourceEntry {
	source := r.GetSource(params.Source)
	if source == nil {
		log.Printf("ListSourceEntries: unknown source kind %s -> Params: %v", params.Source, params)
		return nil
	}

	log.Printf("ListSourceEntries: category=%s sub_category=%s query=%s", params.Category, params.SubCategory, params.Query)
	log.Printf("ListSourceEntries: PathParts=%v", params.PathParts)

	return source.List(params)
}

func (r *SourceRegistry) sourceFromURN(raw string) (Source, urn.URN, bool) {
	ref, err := urn.Parse(raw)
	if err != nil {
		return nil, urn.URN{}, false
	}

	source, ok := r.sourceForRef(ref)
	return source, ref, ok
}

func (r *SourceRegistry) sourceForRef(ref urn.URN) (Source, bool) {
	for _, source := range r.GetAllSources() {
		if source.GetURN().Match(ref) {
			return source, true
		}
	}

	return nil, false
}
