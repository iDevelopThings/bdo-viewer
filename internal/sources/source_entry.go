package sources

import "github.com/idevelopthings/bdo-data-extractor/src/urn"

type SourceEntry[T any] struct {
	Type  SourceKind `json:"type"`
	URN   string     `json:"urn,omitempty"`
	Value T          `json:"value"`
}

func (e *SourceEntry[T]) GetType() SourceKind {
	return e.Type
}
func (e *SourceEntry[T]) GetURN() string {
	return e.URN
}
func (e *SourceEntry[T]) GetValue() any {
	return e.Value
}

// NewEntry builds the ISourceEntry a Source.GetEntry returns from a Store
// lookup — the common "ok ? &SourceEntry[T]{...} : nil" shape every source
// repeats. Returns a true nil interface (not a nil-typed *SourceEntry) when
// ok is false.
func NewEntry[T any](kind SourceKind, ref urn.URN, value T, ok bool) ISourceEntry {
	if !ok {
		return nil
	}
	return &SourceEntry[T]{Type: kind, URN: ref.String(), Value: value}
}

type UntypedSourceEntry struct {
	Type  SourceKind `json:"type"`
	URN   string     `json:"urn,omitempty"`
	Value any        `json:"value"`
}

func (e *UntypedSourceEntry) GetType() SourceKind { return e.Type }
func (e *UntypedSourceEntry) GetURN() string      { return e.URN }
func (e *UntypedSourceEntry) GetValue() any       { return e.Value }

type ISourceEntry interface {
	GetType() SourceKind
	GetURN() string
	GetValue() any
}
