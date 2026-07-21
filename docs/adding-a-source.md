# Adding a Source

Agent guide for adding a new entity type end-to-end: extractor models/URNs →
viewer `Source` → catalog registration → frontend list/detail wiring.

**Canonical simple example:** `CharacterSource`
(`internal/catalog/source_character.go`) — owns its JSON, uses `models.Store`,
registers with `models.RegisterStore`, has a flat nav root and basic list/detail.

**Data-only examples:** `RecipeSource`, `MasterySource` — own data, no sidebar
(empty nav `Id`), still registered so other code / `EntityRef` resolution works.

---

## Mental model

A **Source** is the viewer's unit of ownership for one dataset (items, NPCs,
knowledge, …). It:

1. Loads JSON from the extracted data dir into memory (`Load`)
2. Optionally registers a `models.Store[T]` so `EntityRef[T]` / cross-source
   links can resolve
3. Exposes uniform browse/lookup APIs: navigation tree, list, entry, details,
   stats

`internal/sources` is the framework (interface + registry + list/search types).
`internal/catalog` is where concrete sources live (`source_*.go`) and register
themselves. The frontend never talks to a concrete Go source type — it uses the
registry bindings + `SourceKind` + URNs.

```
bdoextract                          bdo-viewer
─────────                          ──────────
src/model/*          ──JSON──►     catalog.XxxSource.Load()
src/urn handlers                    models.Store[T] + RegisterStore
src/models Store/                   sources.Registry
  EntityRef/BaseFor                      │
                                         ▼
                                   Wails bindings
                                         │
                                         ▼
                                   frontend wrapSource /
                                   list / detail / goToURN
```

Lifecycle at runtime (`internal/boot.LoadData`):

1. `models.Reset()` — clear previous stores (reload-safe)
2. `sources.Registry.LoadAll(reporter)` — each source `Load()`
3. `models.Build()` — run store hooks (cross-refs), after every store is populated

Frontend then calls `GetAllSources` + `GetNavigationTree` via `loadSources()`.

---

## Decide what kind of source you need

| Kind | Nav root `Id` | In "All" search | Typical use |
|------|---------------|-----------------|-------------|
| **Browsable** | non-empty (usually `string(kind)`) | yes | items, NPCs, knowledge, characters, regions, grind spots |
| **Data-only** | empty `SourceNavigationNodeSimple{}` | no | recipes (surfaced via item detail), mastery curves |

Registry skips empty-nav sources in the sidebar and in `SearchAll`
(`searchableSources`).

Also decide URN shape early (see bdoextract section):

- Simple domain: `urn::item:123` — handler with no kinds
- Multi-kind domain: `urn::knowledge:theme:5` / `urn::knowledge:entry:9`
- Dynamic kinds: `urn::recipe:<outputItemId>:<index>`
- String id: `urn::character:<slug>` via `models.NewBaseForKey`

---

## End-to-end checklist

### A. bdoextract (if the type does not exist yet)

1. **URN handler** in `src/urn/urn.go` — package-level `NewHandler(...).EnsureRegistered()`
   (or `.Kinds(...).EnsureRegistered()` / `.DynamicKinds().EnsureRegistered()`).
   `EnsureRegistered` maps domain → handler and a capitalized type name for
   `GetHandlerByType[T]` (used by `BaseFor`).
2. **Model** in `src/model/` — embed `*models.BaseFor[YourType]`, set URN at
   build time with `NewBaseFor` / `NewBaseForKey`. Cross-links use
   `*models.EntityRef[Other]` or `models.EntityRefList[Other]` (serialize as URN
   strings; resolve at runtime after stores are registered).
3. **Extractor output** — dump `yourthing.json` (or a section of an existing
   file) into the extract output dir the viewer reads.
4. Ship / bump extractor so the viewer module can import the new types.

Do **not** redefine equivalent models in the viewer — import
`github.com/idevelopthings/bdo-data-extractor/src/model`.

### B. Viewer backend

1. Add `SourceKind` constant in `internal/sources/source.go`.
2. Create `internal/catalog/source_<name>.go` implementing `sources.Source`
   (compile-time check: `var _ sources.Source = (*XxxSource)(nil)`).
3. Register in `internal/catalog/auto_init.go` via
   `sources.Registry.RegisterSource(NewXxxSource())`.
   Order matters when `Load` reads another source's package-level var (e.g.
   world regions indexing NPCs).
4. If the frontend needs the Go model in generated TS, add a field to
   `catalog.BindingTypes` (and keep `Catalog.Types()`).
5. Optional: source-specific list filters via `ListSourceParams.Filters`
   (`json.RawMessage` → unmarshal into a private struct). Items are the
   reference (`itemFilters` in `source_items.go`).

### C. Viewer frontend

1. Run `wails3 build` (or the project's binding generation path) so
   `SourceKind` and model types appear under `frontend/bindings/`.
2. Extend `URNValueMap` + `isKind` helpers in
   `frontend/src/state/sources/sources.ts` if you need typed entry guards.
3. Add a detail component under `frontend/src/components/details/` and switch
   on `SourceKind` in `details-panel.tsx`. Build it from the shared
   components in `details-components.tsx` (see **Detail views** below) —
   show every useful field, and make cross-entity / map links clickable.
4. Optional filter UI: register in
   `frontend/src/components/entry-list/source-filters.tsx`
   (`SOURCE_FILTER_PANELS`).
5. List/nav usually need **no** new code if the source returns a nav tree and
   `List` rows — `SourceList` + `goToURN` are kind-agnostic.

### D. Validate

- Backend/types: `wails3 build` (preferred over raw `go build` / manual
  `wails3 generate bindings`)
- Frontend-only: `npx tsc --noEmit`, then `npm run lint` after larger changes

---

## Framework pieces (`internal/sources`)

### `Source` interface

```go
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
```

Embed `*sources.BaseSource` for `Kind`, `URN`, `Sorts`, `Reporter`, default
`GetStats` (nil), and `GetURN` / `SetReporter`.

### `SourceURN` / `NewSourceURN`

```go
sources.NewSourceURN(handler, kind, defaultKind)
```

| Args | Meaning | Example |
|------|---------|---------|
| `handler, "", ""` | Match whole domain; `New(id)` with no kind | Item, NPC, Character |
| `handler, "", "entry"` | Match domain's kinds; default kind for id-only construction | Knowledge |
| `handler, "region", "region"` | Match only that kind; construct with that kind | World regions |

Frontend `wrapSource` reads serialized `urn.domain` / `kinds` / `kind` /
`defaultKind` to build matching `entryURN` / `matchesURN` helpers.

### Entries

- Prefer `sources.NewEntry(kind, ref, value, ok)` from `GetEntry` (true nil
  interface when missing).
- Multi-kind sources (knowledge) switch on `ref.Kind` and return
  `&sources.SourceEntry[*model.T]{...}` manually.
- Registry APIs used by the UI: `GetEntryByURN`, `GetEntryDetailsByURN`,
  `GetStatsByURN`, `ListSourceEntries`, `GetNavigationTree`, `GetAllSources`.

`GetAllSources` must only serialize `BaseSource` fields to the webview. Put
stores/indexes on the concrete source with `json:"-"`.

### List / search helpers

- `catalog.FilterAndRank` + `catalog.NameLess` — filter + relevance or explicit
  sort (used by most browsable sources).
- `ListSourceParams`: `Query`, `Source`, `Category`, `SubCategory`, `PathParts`,
  `Sort`, `SortDir`, `Filters`.
- Cross-source search: `SourceKind.All` → `SearchAll` (only sources with a nav
  root; capped at `GlobalSearchLimit`).

---

## Implementing a catalog source (template)

Copy the Character pattern unless you need multi-kind URNs or heavy indexes.

```go
package catalog

type FooSource struct {
	*sources.BaseSource
	Store *models.Store[model.Foo] `json:"-"`
}

var (
	_ sources.Source = (*FooSource)(nil)
	Foos *FooSource
)

func NewFooSource() *FooSource {
	Foos = &FooSource{
		BaseSource: &sources.BaseSource{
			Kind:  sources.Foo,
			URN:   sources.NewSourceURN(urn.Foo, "", ""),
			Sorts: []sources.SortOption{{Key: "name", Label: "Name"}},
		},
	}
	return Foos
}

func (s *FooSource) Load() error {
	var rows []model.Foo
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "foos.json"), &rows); err != nil {
		return err
	}
	s.Store = models.NewStore[model.Foo](len(rows), func(u urn.URN) bool {
		return u.Domain == urn.Foo.Domain()
	})
	for i := range rows {
		row := &rows[i]
		if err := s.Store.Add(row.GetURN(), row); err != nil {
			return err
		}
	}
	models.RegisterStore(s.Store)
	return nil
}

func (s *FooSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *FooSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	return sources.SourceNavigationNodeSimple{Id: string(s.Kind), Title: "Foos"}
}

func (s *FooSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	v, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, v, ok)
}

func (s *FooSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	v, ok := s.Store.Get(ref)
	if !ok {
		return false
	}
	(*outDetails)[string(s.Kind)] = v
	return true
}

func (s *FooSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	name := func(f *model.Foo) string { return f.Name }
	matched := FilterAndRank(
		s.Store.All(),
		params.Query,
		name,
		func(*model.Foo) bool { return true },
		NameLess(name, params.SortDir),
	)
	out := make([]sources.ListSourceEntry, len(matched))
	for i, f := range matched {
		out[i] = sources.ListSourceEntry{
			URN:   f.GetURN().String(),
			Title: f.Name,
		}
	}
	return out
}
```

Then register in `auto_init.go`.

### `GetEntryDetails` contract (frontend)

`DetailStore` does:

```ts
const data = await GetEntryDetailsByURN(entryURN);
this.entry.value = data[this.source.kind]; // key MUST be SourceKind string
```

So always set `(*outDetails)[string(s.Kind)] = primaryEntity`.

Extra keys are optional and consumed ad hoc:

| Key | Used by |
|-----|---------|
| `knowledge` / `knowledgeExtra` | NPC/item/knowledge details |
| `recipes`, `usedIn`, `vendors` | item details |
| `regionExtra` | region details |
| `stats` | sometimes inlined; items/knowledge also use `GetStatsByURN` |

### Navigation tree (`GetNavigationTree`)

Return `SourceNavigationNodeSimple` from the source; the registry fills
`Path` / `Source` and sanitizes ids. Conventions:

- Root `Id` = `string(kind)` (or a stable alias like `"grindspot"`)
- Children `Id` = category key the list filter expects (`Category` /
  `SubCategory` / `PathParts`)
- Knowledge uses theme URNs as node ids and filters list via `PathParts`
- Empty root → no sidebar section (recipes, mastery)

**Build the tree from the data** when the source has a natural hierarchy
(market categories, knowledge themes, territories→regions, grind-spot
zones). A flat single root is fine when there is no taxonomy (characters).

**Cache non-trivial trees on the struct.** `GetNavigationTree` can be hit
often (sidebar + registry merge + searchable checks). If building children
walks a large dataset, store the result:

```go
type FooSource struct {
	*sources.BaseSource
	navigation *sources.SourceNavigationNodeSimple // nil until first build
	// ...
}

func (s *FooSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	if s.navigation != nil {
		return *s.navigation
	}
	s.navigation = &sources.SourceNavigationNodeSimple{
		Id:    string(s.Kind),
		Title: "Foos",
		// Children: built from Store / indexes...
	}
	return *s.navigation
}
```

Existing cached trees: items, knowledge, NPCs, world regions. Flat or
tiny trees (character; grind spots built from a small `View`) may rebuild
inline — prefer caching once the tree is non-trivial or expensive.

### Derived indexes

Prefer extractor packages:

- `models.View[T, R]` — lazy memoized derivation over `Store.All()`
- `models.Reducer` — hook-time aggregates (items' category counts)
- Package-level sibling access: `Knowledge.NpcEntries[...]`, `Items.ItemVendors`

---

## Existing sources (complexity guide)

| Source | File | Notes |
|--------|------|-------|
| Character | `source_character.go` | **Start here** — Store, flat nav, simple details |
| NPC | `source_npc.go` | Views (ByName, Towns), category filter, knowledge side-load |
| GrindSpot | `source_grindspot.go` | View-built region nav children |
| Recipe | `source_recipes.go` | Data-only; empty nav; used by recipe resolver |
| Mastery | `source_mastery.go` | Data-only; no Store; helper APIs only |
| Knowledge | `source_knowledge.go` | Multi-kind URNs, theme tree, stats, reverse indexes |
| WorldRegion | `source_world_regions.go` | Partial domain match (`region`), hand-built maps, cross-NPC index |
| Item | `source_items.go` | Heaviest — multi-file JSON, filters, sorts, stats, market nav |

---

## Frontend wiring

### Boot

`LoadController` (`frontend/src/state/load.ts`) awaits backend `LoadData`, then
`loadSources()` which:

1. `GetAllSources()` → `wrapSource` each (URN helpers)
2. `GetNavigationTree()` → `buildNavigationTree`

### List

`SourceList` + `list.tsx` call `ListSourceEntries` with scope from
`getNavigationListScope(activePath)` (source kind, category, subcategory,
path parts). Sort options come from the wrapped source's `sorts`.

### Opening details

`goToURN(urn)` → `findSourceByURN` → `openSourceDetails(kind, urn)` → dockview
panel → `DetailsPanel` switches on `entry.type` (`SourceKind`).

Adding a browsable source with a detail UI **requires** a new case in
`details-panel.tsx` and a `details-<name>.tsx` component. Use `isKind` /
typed guards from `sources.ts` inside the detail view.

### Typing entries

`URNValueMap` maps urn kind strings (`"item"`, `"knowledge:entry"`,
`"world:region"`, …) to model types. Discriminate with `isKind(entry, "…")`
on the **URN**, not only `entry.type` (knowledge themes vs entries share one
`SourceKind`).

---

## Detail views

Detail UIs live under `frontend/src/components/details/`. The goal is a
**consistent, reusable** panel per source that surfaces the available data
and lets the user follow links (other entities and map locations).

### Shared building blocks (`details-components.tsx`)

Prefer these over one-off markup:

| Component | Use for |
|-----------|---------|
| `DetailsHeader` | Title, optional icon/grade, key/value `lines` |
| `DetailsSection` | Expandable titled block (`borderTop` between sections) |
| `DetailsCollapseSection` | Nested expand/collapse inside a section |
| `Chip` / `ChipList` | Clickable named entities (optional `section` wraps in `DetailsSection`) |
| `DetailsItemList` | Resolve item URNs → `ItemCardSimple` chips (`openItemPanel`) |
| `DetailsNpcList` | Resolve NPC URNs → `NpcCardSimple` chips (`goToURN`) |
| `SectionSubtitle` | Small uppercase label inside a section |
| `EntryTooltip` | Hover card on item chips (used by `ItemCardSimple`) |

Also shared across item/knowledge panels: `DetailsStats`, `GameText`,
`DetailsRecipes` / `DetailsUsedIn`, `EffectSections`.

Typical skeleton (see `details-character.tsx`, `details-grindspot.tsx`):

```tsx
<div className="flex flex-col grow">
  <DetailsHeader title={...} lines={{ "ID": entry.urn, /* useful fields */ }} />
  <div className={"gap-8 pb-8"}>
    <DetailsSection title={"..."} borderTop>
      {/* ChipList / DetailsNpcList / DetailsItemList / custom */}
    </DetailsSection>
  </div>
</div>
```

Register the component in `details-panel.tsx`'s `SourceKind` switch.

### Show the data

Aim to display **everything useful** the backend already returns for that
entry (header lines, linked entities, locations, descriptions, stats). If
`GetEntryDetails` can cheaply attach related data (NPC knowledge, region
NPCs, item vendors), attach it and render it — don't leave linked fields
as dead strings.

Reference panels by density:

| Panel | File | What it demonstrates |
|-------|------|----------------------|
| Character | `details-character.tsx` | Minimal: header + `DetailsNpcList` |
| Grind spot | `details-grindspot.tsx` | Rich header lines, map chip, tag/quest/loot sections |
| Knowledge | `details-knowledge.tsx` | Breadcrumbs, cross-links (`prefer: "navigation"`), item list, stats |
| Item | `details-item.tsx` | Full stack: stats, enhance, acquisition, recipes, knowledge |
| NPC | `details-npc.tsx` | Spawn regions as `ChipList` → `goToURN`, knowledge side panel |
| Region | `details-region.tsx` | Header + NPC list (still has a raw JSON dump — prefer real sections) |

### Cross-entity links (must be followable)

Any related entity the user might want to open should be a click target:

- **Items** → `DetailsItemList` / `openItemPanel` / `ChipList` + `goToURN`
- **NPCs** → `DetailsNpcList` / `NpcCardSimple` / `goToURN`
- **Themes / entries / characters / regions** → `ChipList` + `goToURN(urn, { title, pinned?, prefer? })`
- Middle-click / aux-click should pin a new tab where the shared chips
  already do (`getMiddleClickProps` inside `ChipList` / cards)

`goToURN` with `prefer: "navigation"` is for things that are better as a
sidebar selection (knowledge category breadcrumbs) than a detail tab.

### Map links (entity *and* location)

When something has a world position or worldmap node, expose a **map**
action as well as (or instead of) the entity detail:

| Helper | When |
|--------|------|
| `openMapAt(pos)` | Raw game `[x,y,z]` / `[x,z]` (vendor spawn, zone fallback) |
| `openMapAtNode(urn)` | `urn::world:node:…` (gather nodes, grind-spot node) |

Pattern used today: a `Chip` whose label includes a `MapPinIcon`, click
opens the map panel focused on that place (see grind-spot Location,
item Acquisition vendors / gather nodes).

If a row is both an entity and a place (e.g. an NPC with spawns), prefer:

1. Click **name** → entity detail (`goToURN` / `DetailsNpcList`)
2. Click **map pin** (or a location sub-control) → `openMapAt` /
   `openMapAtNode`

Do not leave spawn coords / node URNs as non-interactive text when the
map helpers can open them.

### Detail checklist for a new source

1. `details-<kind>.tsx` using shared header/sections/lists
2. Case in `details-panel.tsx`
3. `isKind` / `URNValueMap` entry if you need typed guards
4. Every related URN rendered via chips/lists that call `goToURN` /
   `openItemPanel`
5. Every spawn/node/position offered via `openMapAt` / `openMapAtNode`
   (with `MapPinIcon` when it's a map action)
6. Backend `GetEntryDetails` includes the related payloads the UI needs
   (don't force the panel to re-fetch ad hoc unless there's already a
   catalog helper like `GetNpcsByURN`)

---

## bdoextract packages agents touch most

| Package | Role |
|---------|------|
| `src/urn` | `URN`, `Handler`, domain registry (`EnsureRegistered`, `GetHandlerByType`) |
| `src/model` | Concrete entity structs + JSON shapes |
| `src/models` | `Store`, `RegisterStore` / `Build` / `Reset`, `EntityRef` / `EntityRefList`, `BaseFor`, `View`, `Reducer` |

**EntityRef:** durable foreign key is the URN (marshals as string for Wails TS);
`Value` is a runtime cache filled by `GetValue()` via `ResolveUrn[T]` against
the registered `Store[T]`. Lists of refs → `EntityRefList` (SoA: `urns` +
lazy values). Stores must be `RegisterStore`'d during some source's `Load`
before refs resolve.

**BaseFor:** embed `*models.BaseFor[T]` so `GetURN()` works; initialize with
`NewBaseFor[T](id)` or `NewBaseForKey[T](parts...)`. Handler registration must
exist for type name `T` (via `EnsureRegistered`'s domain→TypeName convention,
or explicit `RegisterHandler[T]`).

---

## Common pitfalls

1. **Forgetting `models.RegisterStore`** — `EntityRef` links stay nil forever.
2. **Constructing/touching catalog data in `New*Source`** — only set
   `BaseSource`; load in `Load()` after config/data dir is ready.
3. **Missing `json:"-"` on stores** — `GetAllSources` can OOM the webview.
4. **Details map key ≠ `SourceKind` string** — detail panel never gets
   `entry.value`.
5. **Empty nav when you wanted browse/search** — empty `Id` hides the source
   from sidebar and `SearchAll`.
6. **Wrong `NewSourceURN` kind args** — URNs won't match; `goToURN` /
   `GetEntryByURN` fail silently/log.
7. **Redefining extractor models in the viewer** — don't; import them.
8. **Skipping `BindingTypes`** — Wails may not emit the model into frontend
   bindings.
9. **Frontend detail switch forgotten** — list opens a blank/undefined panel.
10. **Register order** — if `Load` reads another source's global, register the
    dependency first in `auto_init.go`.
11. **Rebuilding a large nav tree every `GetNavigationTree` call** — cache on
    the source struct (items/knowledge/NPC/regions pattern).
12. **One-off detail markup** — reuse `DetailsHeader` / `DetailsSection` /
    `ChipList` / `DetailsNpcList` / `DetailsItemList` first.
13. **Dead related URNs or map positions** — if the data has an NPC, item,
    region, node, or spawn, the panel should open it (`goToURN` /
    `openMapAt` / `openMapAtNode`), not just print the string.

---

## Quick file map

```
# Framework
internal/sources/source.go          SourceKind, Source, Registry, nav merge
internal/sources/source_entry.go    SourceEntry / NewEntry / ISourceEntry
internal/sources/source_urn.go      SourceURN
internal/sources/search.go          SearchAll, ScoreName

# Concrete sources + helpers
internal/catalog/auto_init.go       RegisterSource calls
internal/catalog/source_*.go        one file per source
internal/catalog/search.go          FilterAndRank, NameLess
internal/catalog/catalog.go         BindingTypes, thin facade APIs
internal/boot/boot.go               LoadData: Reset → LoadAll → Build

# Frontend
frontend/src/state/sources/sources.ts
frontend/src/state/list.tsx
frontend/src/state/navigation.tsx
frontend/src/state/detail-store.tsx
frontend/src/state/panels.ts          goToURN, openSourceDetails,
                                      openMapAt, openMapAtNode
frontend/src/components/source-list/
frontend/src/components/details/
  details-components.tsx            shared header/section/chips/lists
  details-panel.tsx                 SourceKind → detail component
  details-*.tsx                     per-source panels
frontend/src/components/entry-list/source-filters.tsx
frontend/bindings/...                 generated — do not hand-edit
```
