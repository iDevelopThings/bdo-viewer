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

// MasterySource owns the life-skill mastery curves (mastery.json). Mastery is a
// single curves object, not a URN-keyed entity set — so it has no Store, nav, or
// browsable entries; it exists to own the data and expose YieldMultiplier for
// crafting-yield math.
type MasterySource struct {
	*sources.BaseSource

	Curves *model.MasteryCurves `json:"-"`
}

var (
	_ sources.Source = (*MasterySource)(nil)

	Mastery *MasterySource
)

func NewMasterySource() *MasterySource {
	Mastery = &MasterySource{
		BaseSource: &sources.BaseSource{
			Kind: sources.Mastery,
			URN:  sources.NewSourceURN(urn.NewHandler("mastery"), "", ""),
		},
	}

	return Mastery
}

func (s *MasterySource) GetSourceKind() sources.SourceKind { return s.Kind }

func (s *MasterySource) Load() error {
	var m model.MasteryCurves
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "mastery.json"), &m); err != nil {
		return errors.Wrap(err, "read mastery.json")
	}
	s.Curves = &m

	return nil
}

// GetNavigationTree returns an empty node — mastery isn't browsed.
func (s *MasterySource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	return sources.SourceNavigationNodeSimple{}
}

func (s *MasterySource) GetEntry(ref urn.URN) sources.ISourceEntry { return nil }

func (s *MasterySource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool { return false }

func (s *MasterySource) List(params sources.ListSourceParams) []sources.ListSourceEntry { return nil }

// YieldMultiplierFor returns the yield multiplier for a recipe type at the
// player's globally-configured mastery (config.Player) — the ambient version
// used by the crafting calculator, so callers don't thread mastery values.
func (s *MasterySource) YieldMultiplierFor(recipeType string) float64 {
	p := config.GetPlayerInfo()
	return s.YieldMultiplier(recipeType, p.CookingMastery, p.AlchemyMastery, p.ProcessingMastery)
}

// YieldMultiplier returns the average output-per-craft multiplier for a recipe of
// the given type at the player's mastery (1.0 = no proc bonus). It uses the right
// client curve for how the item is crafted — Cooking / Alchemy / Processing — and
// returns 1 for worker/workshop crafts (HOUSE/CRAFT/GUILD), imperial packaging
// (ROYALGIFT_*), and simple cooking/alchemy, which don't proc. This models the
// client-side mastery contribution only; the per-recipe base output is server-side.
func (s *MasterySource) YieldMultiplier(recipeType string, cook, alch, proc int) float64 {
	if s.Curves == nil {
		return 1
	}
	switch {
	case recipeType == "COOK":
		return 1 + bracketRate(s.Curves.Cooking, cook, 1) // basicMaxDropRate
	case recipeType == "ALCHEMY":
		return 1 + bracketRate(s.Curves.Alchemy, alch, 0) // basicMaxDropRate
	case processingMasteryTypes[recipeType]:
		return 1 + procBracketRate(s.Curves.Processing, proc)
	default:
		return 1
	}
}

// bracketRate returns rate column idx from the cooking/alchemy curve at the bracket
// applicable to mastery (the highest threshold ≤ mastery), or 0.
func bracketRate(brackets []model.MasteryBracket, mastery, idx int) float64 {
	best, rate := -1, 0.0
	for _, b := range brackets {
		if b.Mastery <= mastery && b.Mastery > best && idx < len(b.Rates) {
			best, rate = b.Mastery, b.Rates[idx]
		}
	}

	return rate
}

// procBracketRate returns the processing proc rate at the bracket applicable to
// mastery, or 0.
func procBracketRate(brackets []model.ProcessingBracket, mastery int) float64 {
	best, rate := -1, 0.0
	for _, b := range brackets {
		if b.Mastery <= mastery && b.Mastery > best {
			best, rate = b.Mastery, b.ProcRate
		}
	}

	return rate
}
