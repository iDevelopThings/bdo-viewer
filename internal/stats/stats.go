package stats

import (
	"strings"
	"time"

	"github.com/idevelopthings/bdo-data-extractor/src/model"

	"bdo-viewer/internal/util"
)

type StatGroupKind string

const (
	// StatGroupKindNone No group, or unknown group.
	StatGroupKindNone StatGroupKind = "none"
	// StatGroupKindCard Cards are top level stat cards, typically holding things like price, weight etc.
	StatGroupKindCard StatGroupKind = "card"
	// StatGroupKindEffects Effects are the main stat group, typically holding things like AP, DP, Accuracy, Evasion etc.
	StatGroupKindEffects StatGroupKind = "effects"
)

// Stat is one formatted title/value pair, ready to render as-is. Raw is the
// pre-format number, so a numeric consumer (e.g. item compare) can compare
// two Stats without re-deriving the value from Value's display string.
type Stat struct {
	Title  string   `json:"title"`
	Value  string   `json:"value"`
	Raw    *float64 `json:"raw,omitempty"`
	Negate bool     `json:"negate,omitempty"` // true if negative is better, ie lower weight is better
}
type StatGroup struct {
	Title string        `json:"title,omitempty"`
	Kind  StatGroupKind `json:"kind"`
	Stats []Stat        `json:"stats"`
}

type StatBuilder struct {
	sections []*Section
}
type Section struct {
	title string
	b     *StatBuilder
	kind  StatGroupKind
	stats []Stat
}

func NewStatBuilder() *StatBuilder {
	return &StatBuilder{
		sections: []*Section{},
	}
}
func (b *StatBuilder) Build() []StatGroup {
	groups := make([]StatGroup, 0, len(b.sections))
	for _, s := range b.sections {
		if len(s.stats) > 0 {
			groups = append(groups, StatGroup{
				Title: s.title,
				Kind:  s.kind,
				Stats: s.stats,
			})
		}
	}

	return groups
}

func (b *StatBuilder) Section(kind StatGroupKind) *Section {
	return b.section(kind, "")
}
func (b *StatBuilder) NamedSection(kind StatGroupKind, title string) *Section {
	return b.section(kind, title)
}
func (b *StatBuilder) section(kind StatGroupKind, title string) *Section {
	s := &Section{
		title: title,
		b:     b,
		kind:  kind,
	}
	b.sections = append(b.sections, s)
	return s
}

// Extend splices already-built groups (the adapted DSL sections) into the
// output. Empty groups are dropped, matching Build's own filter.
func (b *StatBuilder) Extend(groups ...StatGroup) *StatBuilder {
	for _, g := range groups {
		if len(g.Stats) == 0 {
			continue
		}
		b.sections = append(b.sections, &Section{
			b:     b,
			kind:  g.Kind,
			title: g.Title,
			stats: g.Stats,
		})
	}
	return b
}

func (b *StatBuilder) ExtendWithEffectGroups(groups ...model.EffectGroup) *StatBuilder {
	for _, g := range groups {
		b.ExtendWithEffectGroup(g)
	}
	return b
}
func (b *StatBuilder) ExtendWithEffectGroup(g model.EffectGroup) *StatBuilder {
	if len(g.Stats) == 0 {
		return b
	}
	sec := &Section{
		b:     b,
		kind:  StatGroupKindEffects,
		title: g.Title,
		stats: make([]Stat, 0, len(g.Stats)),
	}
	for _, e := range g.Stats {
		sec.FormattedStatMod(e)
	}
	b.sections = append(b.sections, sec)
	return b
}

// ExtendCrystalPreset aggregates equipped crystal StatMods into one effects
// section (game-facing labels/units — not the gear sheet's fanout expansion).
func (b *StatBuilder) ExtendCrystalPreset(items []*model.Item) *StatBuilder {
	type keyed struct {
		mod model.StatMod
	}
	var order []string
	byKey := map[string]*keyed{}

	for _, it := range items {
		if it == nil || it.Effects == nil {
			continue
		}
		for group := range it.Effects.AllStatGroups() {
			for _, sm := range group.Stats {
				if skipCrystalStatMod(sm) {
					continue
				}
				key := crystalModKey(sm)
				if existing := byKey[key]; existing != nil {
					existing.mod.Value += sm.Value
					continue
				}
				order = append(order, key)
				cp := sm
				byKey[key] = &keyed{mod: cp}
			}
		}
	}
	if len(order) == 0 {
		return b
	}

	sec := b.NamedSection(StatGroupKindEffects, "Applied Crystal Effects")
	for _, key := range order {
		sec.FormattedStatMod(byKey[key].mod)
	}
	return b
}

// CrystalEffectSummary joins a crystal's Stat/Hidden mods with " / ", matching
// the transfusion sidebar's per-crystal line (same formatting as FormattedStatMod).
func (b *StatBuilder) CrystalEffectSummary(item *model.Item) string {
	if item == nil || item.Effects == nil {
		return ""
	}
	var parts []string
	for group := range item.Effects.AllStatGroups() {
		for _, sm := range group.Stats {
			if skipCrystalStatMod(sm) {
				continue
			}
			if line := formatStatModLine(sm); line != "" {
				parts = append(parts, line)
			}
		}
	}
	return strings.Join(parts, " / ")
}

func skipCrystalStatMod(sm model.StatMod) bool {
	return sm.EffectDsl != nil || sm.Instant || sm.Stat == ""
}

func crystalModKey(sm model.StatMod) string {
	if sm.StatID != "" {
		return string(sm.StatID) + "\x00" + sm.Op + "\x00" + sm.Unit
	}
	return sm.Stat + "\x00" + sm.Op + "\x00" + sm.Unit
}

func (s *Section) add(title, value string, raw *float64) *Stat {
	s.stats = append(s.stats, Stat{
		Title: title,
		Value: value,
		Raw:   raw,
	})
	return &s.stats[len(s.stats)-1]
}

func (s *Section) Number(title string, v float64) {
	s.add(title, util.FormatNumber(v), new(v))
}
func (s *Section) NumberNonZero(title string, v float64) {
	if v != 0 {
		s.Number(title, v)
	}
}
func (s *Section) NumberUnit(title string, v float64, unit string) {
	s.add(title, util.FormatNumber(v)+" "+unit, new(v))
}
func (s *Section) NumberUnitNonZero(title string, v float64, unit string) {
	if v != 0 {
		s.NumberUnit(title, v, unit)
	}
}
func (s *Section) Money(title string, v int64) {
	s.add(title, util.FormatMoney(v), new(float64(v)))
}
func (s *Section) MoneyNonZero(title string, v int64) {
	if v != 0 {
		s.Money(title, v)
	}
}

// Duration takes an input time and internally handles the conversion, ie:
// time.Duration(item.ExpirationMinutes)*time.Minute
// So we use: section.Duration("Expiration", item.ExpirationMinutes, time.Minute)
func (s *Section) Duration(title string, t float64, unit time.Duration) {
	d := time.Duration(t) * unit
	s.add(title, util.FormatDuration(d), new(d.Seconds()))
}
func (s *Section) DurationNonZero(title string, t float64, unit time.Duration) {
	if t != 0 {
		s.Duration(title, t, unit)
	}
}
func (s *Section) String(title, value string) {
	if value != "" {
		s.add(title, value, nil)
	}
}
func (s *Section) StringRaw(title, value string, raw float64) {
	s.add(title, value, new(raw))
}

// Range renders "min-max" with raw as the one comparable number.
func (s *Section) Range(title string, min, max, raw float64) {
	if min == max {
		s.add(title, util.FormatNumber(raw), new(raw))
		return
	}
	s.add(title, util.FormatNumber(min)+"-"+util.FormatNumber(max), new(raw))
}
func (s *Section) FormattedStatMod(mod model.StatMod) {
	st := s.add(mod.Stat, formatStatModValue(mod), nil)
	if mod.Value != 0 {
		st.Raw = new(mod.Value)
	}
	st.Negate = mod.Negate
}

func formatStatModValue(mod model.StatMod) string {
	if mod.Value == 0 {
		return ""
	}
	return mod.Op + util.FormatNumber(mod.Value) + mod.Unit
}

// formatStatModLine is the in-game single-line form, e.g. "Weight Limit +20 LT".
func formatStatModLine(mod model.StatMod) string {
	if mod.Stat == "" {
		return ""
	}
	if v := formatStatModValue(mod); v != "" {
		return mod.Stat + " " + v
	}
	return mod.Stat
}
