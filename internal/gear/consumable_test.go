package gear

import (
	"testing"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

const (
	catElixir  = model.BuffStackingCategory(2)
	catPerfume = model.BuffStackingCategory(6)
)

// consumable builds a consumable item with the given clears-categories and stat
// modifiers on its Effects.
func consumable(name string, clears []model.BuffStackingCategory, mods ...model.StatMod) *model.Item {
	return &model.Item{
		Name: name,
		Effects: &model.Effects{
			ClearsBuffCategories: clears,
			Stats:                model.EffectGroup{Stats: mods},
		},
	}
}

func cmod(stat model.StatId, value float64, cat model.BuffStackingCategory, group int16) model.StatMod {
	return model.StatMod{StatID: stat, Op: "+", Value: value, BuffCategory: cat, BuffGroup: group}
}

// TestConsumableClearsCategory: applying a draught clears active category-2
// (elixir/draught) effects but leaves other families (perfume, cat 6).
func TestConsumableClearsCategory(t *testing.T) {
	perfume := consumable("Perfume", nil, cmod(model.StatIds.Evasion, 10, catPerfume, 0))
	draughtA := consumable("Draught A", []model.BuffStackingCategory{catElixir}, cmod(model.StatIds.Accuracy, 5, catElixir, 0))
	draughtB := consumable("Draught B", []model.BuffStackingCategory{catElixir}, cmod(model.StatIds.Accuracy, 8, catElixir, 0))

	a := newAccumulator("")
	addConsumables(a, []*model.Item{perfume, draughtA, draughtB})

	if got := a.total(model.StatIds.Accuracy); got != 8 {
		t.Errorf("accuracy = %v, want 8 (draught B clears draught A's cat-2 accuracy)", got)
	}
	if got := a.total(model.StatIds.Evasion); got != 10 {
		t.Errorf("evasion = %v, want 10 (perfume survives — cat 6 not in draught's clears)", got)
	}
}

// TestConsumableBuffGroupReplace: two effects sharing a nonzero buffGroup replace
// (latest wins), they are not summed.
func TestConsumableBuffGroupReplace(t *testing.T) {
	itemA := consumable("A", nil, model.StatMod{StatID: model.StatIds.Accuracy, Op: "+", Value: 5, BuffGroup: 7})
	itemB := consumable("B", nil, model.StatMod{StatID: model.StatIds.Accuracy, Op: "+", Value: 9, BuffGroup: 7})

	a := newAccumulator("")
	addConsumables(a, []*model.Item{itemA, itemB})

	if got := a.total(model.StatIds.Accuracy); got != 9 {
		t.Errorf("accuracy = %v, want 9 (same buffGroup replaces, not sums)", got)
	}
}

// TestConsumableGroupZeroSums: buffGroup 0 means "no group", so those stack.
func TestConsumableGroupZeroSums(t *testing.T) {
	itemA := consumable("A", nil, model.StatMod{StatID: model.StatIds.Accuracy, Op: "+", Value: 5})
	itemB := consumable("B", nil, model.StatMod{StatID: model.StatIds.Accuracy, Op: "+", Value: 9})

	a := newAccumulator("")
	addConsumables(a, []*model.Item{itemA, itemB})

	if got := a.total(model.StatIds.Accuracy); got != 14 {
		t.Errorf("accuracy = %v, want 14 (group 0 stacks)", got)
	}
}

// TestConsumableInCategories drives the set-level clearing decision: when adding
// an item, an active consumable is dropped iff one of its effect stats is in a
// family the new item clears.
func TestConsumableInCategories(t *testing.T) {
	draught := consumable("D", nil, cmod(model.StatIds.Accuracy, 5, catElixir, 0))
	perfume := consumable("P", nil, cmod(model.StatIds.Evasion, 10, catPerfume, 0))
	clears := []model.BuffStackingCategory{catElixir}

	if !consumableInCategories(draught, clears) {
		t.Error("draught (cat 2) should be cleared by a draught's [2]")
	}
	if consumableInCategories(perfume, clears) {
		t.Error("perfume (cat 6) should NOT be cleared by [2]")
	}
	if consumableInCategories(nil, clears) {
		t.Error("nil item should not match")
	}
}

// TestConsumableInstantSkipped: instant effects (Energy / Health EXP gain) are
// not persistent stats; the negated Op is applied to the rest.
func TestConsumableInstantSkipped(t *testing.T) {
	it := consumable("X", nil,
		model.StatMod{StatID: model.StatIds.MaxHp, Op: "+", Value: 100, Instant: true},
		model.StatMod{StatID: model.StatIds.Accuracy, Op: "+", Value: 5},
		model.StatMod{StatID: model.StatIds.GatheringTime, Op: "-", Value: 3},
	)

	a := newAccumulator("")
	addConsumables(a, []*model.Item{it})

	if got := a.total(model.StatIds.MaxHp); got != 0 {
		t.Errorf("maxHp = %v, want 0 (instant effect skipped)", got)
	}
	if got := a.total(model.StatIds.Accuracy); got != 5 {
		t.Errorf("accuracy = %v, want 5", got)
	}
	if got := a.total(model.StatIds.GatheringTime); got != -3 {
		t.Errorf("gatheringTime = %v, want -3 (Op '-' negates)", got)
	}
}
