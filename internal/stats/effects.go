package stats

import "github.com/idevelopthings/bdo-data-extractor/src/model"

// CaphrasStatBonus is a Caphras step's numeric contribution to the item's
// main stats, so a caller can add it onto the base enchant numbers instead of
// leaving it visible only in the Caphras Enhancement effect section.
// Evasion/DamageReduction stay separate (distinct stats); DP() sums them the
// same way bdoextract's own EnchantLevel.Dp does, for the conventional total.
type CaphrasStatBonus struct {
	AP              float64
	Accuracy        float64
	Evasion         float64
	DamageReduction float64
	MaxHP           float64
}

func (b CaphrasStatBonus) DP() float64 { return b.Evasion + b.DamageReduction }

// ResolveCaphrasStatBonus sums the given step's relevant DSL args. Returns a
// zero-value bonus if step is 0/absent or the level isn't Caphras-enhanceable.
func ResolveCaphrasStatBonus(s *model.CaphrasLevel) CaphrasStatBonus {
	var bonus CaphrasStatBonus

	for _, ee := range s.Effects {
		for _, e := range ee.Stats {
			if len(e.Args) == 0 {
				continue
			}
			arg := e.Args[0]
			switch e.Func {
			case "ALL_AP_INCRE":
				bonus.AP += arg
			case "ALL_HIT_INCRE":
				bonus.Accuracy += arg
			case "ALL_EVA_INCRE", "HIDDEN_EVA_INCRE":
				bonus.Evasion += arg
			case "ALL_DAM_REDUCE_INCRE", "HIDDEN_DAM_REDUCE_INCRE":
				bonus.DamageReduction += arg
			case "HP_UP":
				bonus.MaxHP += arg
				// ALL_DP_INCRE is unhandled by design: confirmed 0 occurrences
				// across items.json, and unlike the Evasion/DamageReduction
				// funcs above it wouldn't be clear which one it should credit.
			}
		}
	}

	return bonus
}
