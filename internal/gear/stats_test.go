package gear

import (
	"testing"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

func statTotal(s *StatSheet, key model.StatId) float64 {
	if v := s.Stats[key]; v != nil {
		return v.Total
	}
	return 0
}

// TestFanoutPropagation checks that umbrella stats cascade to their components.
func TestFanoutPropagation(t *testing.T) {
	a := newAccumulator("melee")
	a.add(model.StatIds.AllResistance, 10, "test")
	for _, k := range []model.StatId{model.StatIds.GrappleResistance, model.StatIds.KnockbackResistance, model.StatIds.KnockdownResistance, model.StatIds.StunResistance} {
		if got := a.total(k); got != 10 {
			t.Errorf("allResistance did not reach %s: got %v, want 10", k, got)
		}
	}

	a = newAccumulator("melee")
	a.add(model.StatIds.MonsterAp, 5, "test") // Extra AP vs Monsters -> every species bucket
	for _, k := range []model.StatId{model.StatIds.ApVsMonster, model.StatIds.ApVsHuman, model.StatIds.ApVsDemihuman, model.StatIds.ApVsKamasylvian} {
		if got := a.total(k); got != 5 {
			t.Errorf("monsterAp did not reach %s: got %v, want 5", k, got)
		}
	}

	// Weapon-type routing: a melee class's meleeAp feeds the AP totals.
	a = newAccumulator("melee")
	a.add(model.StatIds.MeleeAp, 3, "test")
	if got := a.total(model.StatIds.TotalAp); got != 3 {
		t.Errorf("meleeAp did not reach totalAp: got %v, want 3", got)
	}
}

func setSlot(name string, setKey uint32) Slot {
	mod := func(fn string, v float64) model.StatMod {
		return model.StatMod{EffectDsl: &model.EffectDsl{Func: fn}, Value: v}
	}
	return Slot{
		Item: &model.Item{Name: name, ItemSets: model.ItemSetRefList(setKey)},
		Enhancement: &model.EnchantLevel{
			Effects: []model.EffectGroup{
				{Title: "Set Effect (3-piece)", Stats: []model.StatMod{mod("ENDURANCE_UP", 200)}},
				{Title: "Set Effect (4-piece)", Stats: []model.StatMod{mod("ALL_AP_UP", 8)}},
			},
		},
	}
}

// TestSetEffects checks piece-count gating, apply-once dedup, and flat-AP.
func TestSetEffects(t *testing.T) {
	four := []Slot{setSlot("a", 51134), setSlot("b", 51134), setSlot("c", 51134), setSlot("d", 51134)}

	// 3 pieces: only the 3-piece tier fires (stamina), 4-piece AP does not.
	a := newAccumulator("melee")
	addSetEffects(a, four[:3])
	if got := a.total(model.StatIds.MaxStamina); got != 200 {
		t.Errorf("3-piece stamina = %v, want 200 (once, not per-piece)", got)
	}
	if got := a.total(model.StatIds.ApMax); got != 0 {
		t.Errorf("3 pieces should not trigger the 4-piece AP tier: got %v", got)
	}

	// 4 pieces: both tiers fire, each once. ALL_AP_UP feeds the AP dice.
	a = newAccumulator("melee")
	addSetEffects(a, four)
	if got := a.total(model.StatIds.MaxStamina); got != 200 {
		t.Errorf("4-piece stamina = %v, want 200", got)
	}
	for _, k := range []model.StatId{model.StatIds.ApMin, model.StatIds.ApMax, model.StatIds.AwakeningApMax} {
		if got := a.total(k); got != 8 {
			t.Errorf("4-piece flat AP %s = %v, want 8 (once)", k, got)
		}
	}
}

// numericBackedStats are the stats addEnchantFlats already fills from a typed
// enchant field. A DSL func routing to one of these double-counts in enchant
// effects unless it's skipped (enchantNumericDupes).
var numericBackedStats = map[model.StatId]bool{
	model.StatIds.Ap: true, model.StatIds.ApMin: true, model.StatIds.ApMax: true,
	model.StatIds.AwakeningAp: true, model.StatIds.AwakeningApMin: true, model.StatIds.AwakeningApMax: true,
	model.StatIds.Accuracy: true, model.StatIds.Evasion: true, model.StatIds.HiddenEvasion: true,
	model.StatIds.DamageReduction: true, model.StatIds.HiddenDamageReduction: true,
	model.StatIds.Dp: true, model.StatIds.MaxHp: true,
}

// TestNoUnhandledNumericDupes guards the double-count policy: every routed func
// that feeds a numeric-backed stat must be skipped in the enchant paths.
func TestNoUnhandledNumericDupes(t *testing.T) {
	check := func(fn, stat string) {
		if stat != "" && numericBackedStats[model.StatId(stat)] && !enchantNumericDupes[fn] {
			t.Errorf("func %q routes to numeric-backed stat %q but is not in enchantNumericDupes — it will double-count e.%s in enchant effects", fn, stat, stat)
		}
	}
	for _, info := range model.EffectFuncStats.Infos() {
		check(string(info.EffectFuncStat), string(info.Stat))
	}
}

// TestGearScore checks the headline score: floor((ap+aap)/2)+dp, and Shai's
// no-awakening special case (ap+dp).
func TestGearScore(t *testing.T) {
	if got := gearScore(model.CharacterClassTypeMaehwa, 300, 280, 400); got != 690 {
		t.Errorf("score = %d, want 690 (floor((300+280)/2)+400)", got)
	}
	if got := gearScore(model.CharacterClassTypeMaehwa, 301, 280, 400); got != 690 {
		t.Errorf("odd-sum score = %d, want 690 (floored, not rounded)", got)
	}
	if got := gearScore(model.CharacterClassTypeShai, 300, 280, 400); got != 700 {
		t.Errorf("Shai score = %d, want 700 (ap+dp, awakening ignored)", got)
	}
}

// TestSetEffectsPerSet proves piece counts are tallied per set, not pooled: 3
// pieces of set A + 2 of set B must fire only set A's 3-piece tier. A combined
// count of 5 would wrongly trigger the 4-piece tier.
func TestSetEffectsPerSet(t *testing.T) {
	slots := []Slot{
		setSlot("a1", 51134), setSlot("a2", 51134), setSlot("a3", 51134),
		setSlot("b1", 58080), setSlot("b2", 58080),
	}
	a := newAccumulator("melee")
	addSetEffects(a, slots)
	if got := a.total(model.StatIds.MaxStamina); got != 200 {
		t.Errorf("stamina = %v, want 200 (set A has 3 -> its 3-piece; set B's 3-piece needs 3, has 2)", got)
	}
	if got := a.total(model.StatIds.ApMax); got != 0 {
		t.Errorf("4-piece AP = %v, want 0 (no single set has 4 pieces; a pooled count would fire it)", got)
	}
}

// TestMasteryPoints checks the rank+level -> points piecewise curve
func TestMasteryPoints(t *testing.T) {
	cases := []struct {
		rank, lvl, want int
	}{
		{0, 0, 0},     // below 1
		{1, 0, 0},     // e=1
		{1, 1, 15},    // e=2
		{5, 5, 55},    // e=10
		{6, 5, 60},    // e=11
		{20, 20, 350}, // e=40
		{70, 61, 800}, // e=131, past the 130 rolloff
	}
	for _, c := range cases {
		if got := MasteryPoints(c.rank, c.lvl); got != c.want {
			t.Errorf("MasteryPoints(%d,%d) = %d, want %d", c.rank, c.lvl, got, c.want)
		}
	}
}

// TestCritChanceFromLevel checks the 0-5 crit-level -> chance% table and its cap.
func TestCritChanceFromLevel(t *testing.T) {
	cases := map[float64]float64{0: 0, 1: 5, 2: 9, 3: 12, 4: 15, 5: 18, 8: 18}
	for level, want := range cases {
		a := newAccumulator("melee")
		if level > 0 {
			a.add(model.StatIds.CritLevel, level, "test")
		}
		deriveCritChance(a)
		if got := a.total(model.StatIds.CritChance); got != want {
			t.Errorf("crit level %v -> chance %v, want %v", level, got, want)
		}
	}
}

// TestNakedBaseStats checks the deterministic class + level + base-kit floor for
// a naked character (no gear, no fitness, no passives). These are the pieces we
// have data for; the in-game absolute values are higher by the passive-skill
// contribution we don't model.
func TestNakedBaseStats(t *testing.T) {
	s := ComputeStats(model.CharacterClassTypeMaehwa, 61, Fitness{}, nil, nil)

	checks := map[model.StatId]float64{
		model.StatIds.Accuracy:             421, // class 417 + base kit 4
		model.StatIds.StunResistance:       20,  // class base CC resist
		model.StatIds.MeleeEvasion:         330, // class hidden 326 + base kit 4
		model.StatIds.MeleeDamageReduction: 32,  // class hidden 30 + base kit 1 + level-56 1
	}
	for k, want := range checks {
		if got := statTotal(s, k); got != want {
			t.Errorf("%s = %v, want %v", k, got, want)
		}
	}
	if s.AP != 2 { // base kit + level-60 apMin/apMax
		t.Errorf("AP = %d, want 2", s.AP)
	}
	if s.DP != 2 { // base kit + level-56
		t.Errorf("DP = %d, want 2", s.DP)
	}
}
