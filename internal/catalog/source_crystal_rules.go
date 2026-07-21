package catalog

import (
	"path/filepath"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"
)

// CrystalRulesSource owns crystal_rules.json — transfusion group caps and
// special-slot allowlists. Data-only (no nav / entries).
type CrystalRulesSource struct {
	*sources.BaseSource

	Rules *model.CrystalRules `json:"-"`
}

var (
	_ sources.Source = (*CrystalRulesSource)(nil)

	CrystalRules *CrystalRulesSource
)

func NewCrystalRulesSource() *CrystalRulesSource {
	CrystalRules = &CrystalRulesSource{
		BaseSource: &sources.BaseSource{
			Kind: sources.CrystalRules,
			URN:  sources.NewSourceURN(urn.NewHandler("crystalrules"), "", ""),
		},
	}
	return CrystalRules
}

func (s *CrystalRulesSource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *CrystalRulesSource) Load() error {
	var rules model.CrystalRules
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "crystal_rules.json"), &rules); err != nil {
		return errors.Wrap(err, "read crystal_rules.json")
	}
	s.Rules = &rules
	return nil
}

func (s *CrystalRulesSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	return sources.SourceNavigationNodeSimple{}
}

func (s *CrystalRulesSource) GetEntry(ref urn.URN) sources.ISourceEntry { return nil }

func (s *CrystalRulesSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	return false
}

func (s *CrystalRulesSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	return nil
}

// GroupMax returns the transfusion max for a crystal group key, or 0 if unknown.
func (s *CrystalRulesSource) GroupMax(key uint32) int {
	if s == nil || s.Rules == nil {
		return 0
	}
	for _, g := range s.Rules.Groups {
		if g.Key == key {
			return g.Max
		}
	}
	return 0
}

// EffectiveGroupMax is how many of a family a preset may hold: the rules' cap when they carry one,
// else the group's own. Uncapped families carry a sentinel far above the 23 preset sockets.
func (s *CrystalRulesSource) EffectiveGroupMax(group *model.CrystalGroup) int {
	if group == nil {
		return 0
	}
	if rulesMax := s.GroupMax(group.Key); rulesMax > 0 {
		return rulesMax
	}

	return group.Max
}

// GroupFull reports whether a preset holding the given per-group counts is already at this
// family's cap, so another of it can't be socketed. An unknown group is treated as unlimited —
// a zero max would otherwise read as "full" and hide the family entirely.
func (s *CrystalRulesSource) GroupFull(group *model.CrystalGroup, usage map[uint32]int) bool {
	max := s.EffectiveGroupMax(group)
	if max <= 0 {
		return false
	}

	return usage[group.Key] >= max
}

// AllowedGroupsForSpecialSlot returns the crystal group keys accepted by a
// special preset slot, or nil if the slot has no restriction row.
func (s *CrystalRulesSource) AllowedGroupsForSpecialSlot(slot model.CrystalSpecialSlot) []uint32 {
	if s == nil || s.Rules == nil {
		return nil
	}
	for _, row := range s.Rules.SpecialSlots {
		if row.Slot == slot {
			return row.AllowedGroups
		}
	}
	return nil
}
