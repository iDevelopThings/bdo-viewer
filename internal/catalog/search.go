package catalog

import (
	"sort"
	"strings"
)

// FilterAndRank narrows items to those satisfying pass (and, with a query, to
// those matching it), then orders the survivors. An explicit less comparator
// always wins — a chosen sort applies whether or not there's a query. Only when
// less is nil does it fall back to best-match-first relevance ranking (for a
// query) or the original order (without one).
func FilterAndRank[T any](items []T, query string, name func(T) string, pass func(T) bool, less func(a, b T) bool) []T {
	tokens := strings.Fields(strings.ToLower(query))
	if len(tokens) == 0 {
		var out []T
		for _, it := range items {
			if pass(it) {
				out = append(out, it)
			}
		}
		if less != nil {
			sort.SliceStable(out, func(i, j int) bool { return less(out[i], out[j]) })
		}

		return out
	}

	rq := strings.ToLower(strings.TrimSpace(query))
	type scored struct {
		it    T
		score int
	}

	var matched []scored
	for _, it := range items {
		if !pass(it) {
			continue
		}
		if s, ok := scoreName(strings.ToLower(name(it)), rq, tokens); ok {
			matched = append(matched, scored{it, s})
		}
	}

	if less != nil {
		sort.SliceStable(matched, func(i, j int) bool { return less(matched[i].it, matched[j].it) })
	} else {
		sort.SliceStable(
			matched, func(i, j int) bool {
				if matched[i].score != matched[j].score {
					return matched[i].score < matched[j].score
				}

				return len(name(matched[i].it)) < len(name(matched[j].it))
			},
		)
	}

	out := make([]T, len(matched))
	for i, m := range matched {
		out[i] = m.it
	}

	return out
}

// NameLess returns an alphabetical-by-name comparator for FilterAndRank; dir
// "desc" reverses it.
func NameLess[T any](name func(T) string, dir string) func(a, b T) bool {
	return func(a, b T) bool {
		if dir == "desc" {
			return name(a) > name(b)
		}

		return name(a) < name(b)
	}
}

// scoreName ranks how well a lowercased name matches the query. Lower is better;
// ok is false when not all tokens are present.
func scoreName(name, rawQuery string, tokens []string) (int, bool) {
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
