package sources

import "github.com/idevelopthings/bdo-data-extractor/src/urn"

type SourceURN struct {
	Handler     urn.Handler `json:"-"`
	Domain      string      `json:"domain"`
	Kinds       []string    `json:"kinds,omitempty"`
	Kind        string      `json:"kind,omitempty"`
	DefaultKind string      `json:"defaultKind,omitempty"`
}

func NewSourceURN(handler urn.Handler, kind string, defaultKind string) SourceURN {
	return SourceURN{
		Handler:     handler,
		Domain:      handler.Domain(),
		Kinds:       handler.KindList(),
		Kind:        kind,
		DefaultKind: defaultKind,
	}
}

func (s SourceURN) Match(ref urn.URN) bool {
	if s.Kind != "" {
		return s.Handler.Match(ref, s.Kind)
	}

	return s.Handler.Match(ref)
}

func (s SourceURN) New(id uint32) urn.URN {
	switch {
	case s.DefaultKind != "":
		return s.Handler.New(s.DefaultKind, id)
	case s.Kind != "":
		return s.Handler.New(s.Kind, id)
	default:
		return s.Handler.New(id)
	}
}
