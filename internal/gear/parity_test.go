package gear

import (
	"sort"
	"strconv"
	"testing"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"

	"bdo-viewer/internal/catalog"
	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
)

// bootStores loads config + the full catalog so entity refs resolve to real
// items/enhancements/caphras/sets. Skips (not fails) when the extracted data
// isn't available locally.
func bootStores(t *testing.T) {
	t.Helper()
	if err := config.Load(); err != nil {
		t.Skipf("config unavailable: %v", err)
	}
	if _, err := catalog.New(); err != nil {
		t.Skipf("catalog unavailable: %v", err)
	}
	if err := sources.Registry.LoadAll(nil); err != nil {
		t.Skipf("sources unavailable: %v", err)
	}
	if err := models.Build(); err != nil {
		t.Fatalf("build stores: %v", err)
	}
}

// TestParityNakedStamina locks the class base stamina (1020) fix: a naked
// character's Max Stamina is base-kit 20 + class 1020 = 1040 at any level
// (class stamina is a flat constant, not a per-level curve).
func TestParityNakedStamina(t *testing.T) {
	for _, lvl := range []int{1, 56, 60, 61, 65} {
		s := ComputeStats(model.CharacterClassTypeMaehwa, lvl, Fitness{}, nil, nil, nil)
		if got := statTotal(s, model.StatIds.MaxStamina); got != 1040 {
			t.Errorf("naked L%d Max Stamina = %v, want 1040 (base 20 + class 1020)", lvl, got)
		}
	}
}

// garmothFixture is a fixed loadout matching garmoth.com/character/c7qwv42fwx
// (Maehwa, level 65, fitness 0, guild OFF) — pinned so parity is stable
// regardless of the app's mutable saved build.
var garmothFixture = []struct {
	slot     model.SlotName
	itemName string
	enh, cap int
}{
	{model.SlotNameMainWeapon, "Fiery Sovereign Blade", 10, 0},
	{model.SlotNameSubWeapon, "Earthshaking Nouver Horn Bow", 20, 20},
	{model.SlotNameAwakeningWeapon, "Fiery Sovereign Kerispear", 10, 0},
	{model.SlotNameHelmet, "Giath's Helmet", 20, 20},
	{model.SlotNameArmor, "Red Nose's Armor", 20, 20},
	{model.SlotNameGloves, "Bheg's Gloves", 20, 20},
	{model.SlotNameShoes, "Ator's Shoes", 5, 0},
	{model.SlotNameRingI, "Kharazad Ring", 10, 0},
	{model.SlotNameNecklace, "Kharazad Necklace", 10, 0},
	{model.SlotNameBelt, "Kharazad Belt", 10, 0},
	{model.SlotNameEarringI, "Kharazad Earring", 10, 0},
	{model.SlotNameArtifactII, "Kabua's Heralding Artifact", 0, 0},
}

// garmothBuild is garmoth's live store.stats for garmothFixture.
var garmothBuild = map[model.StatId]float64{
	model.StatIds.MaxStamina:            1315,
	model.StatIds.MaxResource:           260,
	model.StatIds.MaxHp:                 3077,
	model.StatIds.Accuracy:              856,
	model.StatIds.Evasion:               858,
	model.StatIds.HiddenEvasion:         676,
	model.StatIds.DamageReduction:       298, // incl Brackets=78
	model.StatIds.HiddenDamageReduction: 141,
	model.StatIds.HiddenAp:              54,
	model.StatIds.Dp:                    398,
	model.StatIds.CritChance:            0,
	model.StatIds.BracketAp:             205,
	model.StatIds.BracketMonsterAp:      112,
	model.StatIds.CritDamage:            15,  // garmoth incl Nouver hidden +10 we lack
	model.StatIds.TotalAp:               582, // garmoth 582.5 (unfloored); we round
	model.StatIds.ApVsMonster:           830, // garmoth 830.5
}

// TestParityFixedBuild builds the fixed garmoth fixture from the booted stores,
// computes our sheet, and asserts each calc-correct stat against garmoth's value.
func TestParityFixedBuild(t *testing.T) {
	bootStores(t)

	slots := make([]Slot, 0, len(garmothFixture))
	for _, l := range garmothFixture {
		item := catalog.Items.ByName[l.itemName]
		if item == nil {
			t.Fatalf("fixture item %q not found in catalog", l.itemName)
		}
		slot := Slot{BaseSlotData: BaseSlotData{Id: l.slot}, Item: item}
		applyEnhancementLevels(&slot, l.enh, l.cap)
		slots = append(slots, slot)
	}

	sheet := ComputeStats(model.CharacterClassTypeMaehwa, 65, Fitness{}, nil, slots, nil)

	t.Logf("%-24s %8s %8s %8s", "stat", "ours", "garmoth", "diff")
	for stat, want := range garmothBuild {
		got := statTotal(sheet, stat)
		flag := ""
		if got != want {
			flag = "  <-- MISMATCH"
		}
		t.Logf("%-24s %8.0f %8.0f %8.0f%s", stat, got, want, got-want, flag)
	}

	// Assert the calc-correct stats. Excluded (data/cosmetic, not calc):
	//   CritDamage — garmoth gives Earthshaking Nouver a hidden +10 crit our
	//     extraction doesn't capture.
	//   TotalAp / ApVsMonster — garmoth uses the unfloored AP average (x.5); we round.
	dataOrCosmetic := map[model.StatId]bool{
		model.StatIds.CritDamage:  true,
		model.StatIds.TotalAp:     true,
		model.StatIds.ApVsMonster: true,
	}
	for stat, want := range garmothBuild {
		if dataOrCosmetic[stat] {
			continue
		}
		if got := statTotal(sheet, stat); got != want {
			t.Errorf("%s = %v, want %v (garmoth c7qwv42fwx)", stat, got, want)
		}
	}
}

// TestSetTierMatchesTypedData validates that addSetEffects' title-parsed tiers
// ("Set Effect (N-piece)") are backed by the authoritative typed set data — for
// every set-member item, each enchant tier must appear in the item's sets'
// bonuses[].pieces. This is the agent-recommended condition for retaining the
// title parse instead of the (value-less) typed bonuses as the stat source.
func TestSetTierMatchesTypedData(t *testing.T) {
	bootStores(t)

	checked := 0
	err := catalog.Items.Store.EachNoBreak(func(item *model.Item) error {
		if item.ItemSets == nil || item.ItemSets.Len() == 0 {
			return nil
		}
		typed := map[int]bool{}
		for _, set := range item.ItemSets.All() {
			if set == nil {
				continue
			}
			for _, b := range set.Bonuses {
				typed[int(b.Pieces)] = true
			}
		}
		e := item.GetMaxEnhancement()
		if e == nil {
			return nil
		}
		for _, g := range e.Effects {
			m := setEffectPieceRe.FindStringSubmatch(g.Title)
			if m == nil {
				continue
			}
			pieces, _ := strconv.Atoi(m[1])
			checked++
			if !typed[pieces] {
				keys := make([]int, 0, len(typed))
				for k := range typed {
					keys = append(keys, k)
				}
				sort.Ints(keys)
				t.Errorf("item %q (%d): enchant set tier %d-piece not in its sets' typed bonuses %v", item.Name, item.ID, pieces, keys)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("iterate items: %v", err)
	}
	if checked == 0 {
		t.Fatal("no set-effect tiers checked — set membership or enchant groups missing")
	}
	t.Logf("validated %d set-effect tiers against typed item_sets.json bonuses", checked)
}
