package sources

import (
	"sort"
	"strings"

	"github.com/dgravesa/go-parallel/parallel"
)

// GlobalSearchLimit caps how many merged results a cross-source search returns.
const GlobalSearchLimit = 200

// SearchAll fans the query out to every browsable source, then re-ranks the
// merged hits against each other — each source ranks (or name-sorts) internally,
// so scoring the survivors again is what makes one list out of many.
// An empty query returns nothing: without one this would be every entry we own.
func (r *SourceRegistry) SearchAll(params ListSourceParams) []ListSourceEntry {
	tokens := SearchTokens(params.Query)
	if len(tokens) == 0 {
		return nil
	}

	srcs := r.searchableSources()
	perSource := make([][]ListSourceEntry, len(srcs))

	parallel.For(
		len(srcs), func(i, _ int) {
			perSource[i] = srcs[i].List(
				ListSourceParams{
					Query:  params.Query,
					Source: srcs[i].GetSourceKind(),
				},
			)
		},
	)

	rq := strings.ToLower(strings.TrimSpace(params.Query))

	type scored struct {
		entry ListSourceEntry
		score int
		order int
	}

	var matched []scored
	for i, entries := range perSource {
		for _, e := range entries {
			if e.URN == "" {
				continue
			}
			score, ok := ScoreName(strings.ToLower(e.Title), rq, tokens)
			if !ok {
				continue
			}

			matched = append(
				matched, scored{
					entry: e,
					score: score,
					order: i,
				},
			)
		}
	}

	sort.SliceStable(
		matched, func(i, j int) bool {
			a, b := matched[i], matched[j]
			if a.score != b.score {
				return a.score < b.score
			}
			if len(a.entry.Title) != len(b.entry.Title) {
				return len(a.entry.Title) < len(b.entry.Title)
			}

			return a.order < b.order
		},
	)

	if len(matched) > GlobalSearchLimit {
		matched = matched[:GlobalSearchLimit]
	}

	// The badge each row shows: stamped after the cut, since a broad query matches
	// far more entries than it returns.
	out := make([]ListSourceEntry, len(matched))
	for i, m := range matched {
		e := m.entry
		if e.Extra == nil {
			e.Extra = make(map[string]any, 1)
		}
		e.Extra["source"] = srcs[m.order].GetSourceKind()
		out[i] = e
	}

	return out
}

// searchableSources are the ones a user can browse — a source with no sidebar
// root (recipes) isn't something you can open from a result row either.
func (r *SourceRegistry) searchableSources() []Source {
	all := r.GetAllSources()
	out := make([]Source, 0, len(all))
	for _, source := range all {
		if source.GetNavigationTree().Id == "" {
			continue
		}
		out = append(out, source)
	}

	return out
}

// SearchTokens splits a query into the lowercased terms a name must contain to match.
func SearchTokens(query string) []string {
	return strings.Fields(strings.ToLower(query))
}

// ScoreName ranks how well a lowercased name matches the query. Lower is better;
// ok is false when not all tokens are present.
func ScoreName(name, rawQuery string, tokens []string) (int, bool) {
	for _, t := range tokens {
		if !strings.Contains(name, t) {
			return 0, false
		}
	}

	switch {
	case name == rawQuery:
		return 0, true
	case strings.HasPrefix(name, rawQuery):
		return 1, true
	case strings.Contains(name, rawQuery):
		return 2, true
	default:
		return 3, true
	}
}
