package gear

import (
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

// The stat pipeline; every contribution funnels through an
// accumulator that propagates it across the fan-out graph (each StatId's Fanout),
// so umbrella stats (All Resistance, Extra AP vs Monsters, ...) reach their
// component buckets.

// StatSource is one contribution to a stat, kept for the breakdown display.
type StatSource struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

// StatValue is an accumulated stat: its total and where each part came from.
type StatValue struct {
	Total   float64      `json:"total"`
	Sources []StatSource `json:"sources"`
}

// Fitness is the character's Strength/Breath/Health levels.
type Fitness struct {
	Strength int `json:"strength"`
	Breath   int `json:"breath"`
	Health   int `json:"health"`
}

// StatSheet is the computed character sheet: headline AP/AAP/DP plus every stat
// keyed by its StatId (see model.StatId(key).Info() for label/category/unit).

type StatSheet struct {
	AP    int                         `json:"ap"`  // sheet main-hand AP, floor((apMin+apMax)/2)
	AAP   int                         `json:"aap"` // sheet awakening AP
	DP    int                         `json:"dp"`
	Score int                         `json:"score"`
	Stats map[model.StatId]*StatValue `json:"stats"`
}

// accumulator sums stat contributions through the fan-out graph.
type accumulator struct {
	stats  map[model.StatId]*StatValue
	fanout map[model.StatId][]model.StatId
}

// newAccumulator builds the fan-out from the StatId enum and adds the class's
// weapon-type AP routing (a melee class's meleeAp feeds the AP totals, etc.).
func newAccumulator(damageType string) *accumulator {
	fanout := make(map[model.StatId][]model.StatId)
	for _, info := range model.StatIds.Infos() {
		if len(info.Fanout) > 0 {
			entries := make([]model.StatId, len(info.Fanout))
			for i, label := range info.Fanout {
				entries[i] = model.StatId(label)
			}
			fanout[info.StatId] = entries
		}
	}
	totals := []model.StatId{model.StatIds.TotalAp, model.StatIds.TotalAwakeningAp}
	switch damageType {
	case "melee":
		fanout[model.StatIds.MeleeAp] = totals
	case "range":
		fanout[model.StatIds.RangedAp] = totals
	case "magic":
		fanout[model.StatIds.MagicAp] = totals
	}
	return &accumulator{
		stats:  make(map[model.StatId]*StatValue),
		fanout: fanout,
	}
}

func (a *accumulator) add(key model.StatId, value float64, source string) {
	if value == 0 {
		return
	}
	for _, parent := range a.fanout[key] {
		a.add(parent, value, source)
	}
	s := a.stats[key]
	if s == nil {
		s = &StatValue{}
		a.stats[key] = s
	}
	s.Total += value
	s.Sources = append(s.Sources, StatSource{
		Name:  source,
		Value: value,
	})
}

func (a *accumulator) total(key model.StatId) float64 {
	if s := a.stats[key]; s != nil {
		return s.Total
	}
	return 0
}

// Mastery is a life skill's rank and level, from which mastery points derive.
type Mastery struct {
	Rank int
	Lvl  int
}

// MasterySet maps a life-skill mastery stat to the player's rank+level in it.
type MasterySet map[model.StatId]Mastery

// ComputeStats runs the full pipeline for a loadout and returns the sheet.
func ComputeStats(
	class model.CharacterClassType,
	level int,
	fitness Fitness,
	mastery MasterySet,
	slots []Slot,
	consumables []*model.Item,
	crystals []*model.Item,
) *StatSheet {
	cls, hasClass := model.GenClassStats[class]

	a := newAccumulator(cls.DamageType)
	addFitness(a, fitness)
	addBaseKit(a)
	if hasClass {
		addClass(a, cls, level)
	}
	addLevelMilestones(a, level)
	addGear(a, slots)
	addSetEffects(a, slots)
	addConsumables(a, consumables)
	addCrystals(a, crystals)
	applyBrackets(a)
	addMastery(a, mastery)
	deriveCritChance(a)

	sheet := derive(a)
	sheet.Score = gearScore(class, sheet.AP, sheet.AAP, sheet.DP)
	return sheet
}

// gearScore headline gear score: floor((AP+AAP)/2) + DP, except Shai
// (no awakening weapon), which uses AP + DP.
func gearScore(class model.CharacterClassType, ap, aap, dp int) int {
	if class == model.CharacterClassTypeShai {
		return ap + dp
	}
	return (ap+aap)/2 + dp
}

// MasteryPoints converts a life skill's rank+level to mastery points
// Returns 0 below rank+level 1.
func MasteryPoints(rank, lvl int) int {
	e := rank + lvl
	if e < 1 {
		return 0
	}
	s := 0
	if e >= 2 {
		s += 10
	}
	if e > 10 {
		s += 40
	} else {
		s += 5 * (e - 1)
	}
	if e >= 40 {
		s += 300
	} else if e > 10 {
		s += 10 * (e - 10)
	}
	if e > 40 {
		s += 5 * (e - 40)
		if e > 130 {
			s -= 5 * (e - 130)
		}
	}
	return s
}

// addMastery folds the player's life-skill mastery (from rank+level) into the
// mastery stats — separate from gear-granted mastery, which sums on top.
func addMastery(a *accumulator, ms MasterySet) {
	for stat, m := range ms {
		if pts := MasteryPoints(m.Rank, m.Lvl); pts != 0 {
			a.add(stat, float64(pts), "Mastery")
		}
	}
}

// addConsumables folds active consumables' timed buff stats into the sheet,
// applying the client's stacking rules across items in activation order:
//  1. Using an item first clears active effects whose broad family (BuffCategory)
//     is listed in the item's ClearsBuffCategories — e.g. a draught clears other
//     draughts (category 2) but leaves perfumes (6) and whale-tendon (21).
//  2. Each incoming stat with a nonzero BuffGroup replaces any active stat sharing
//     that group (latest wins; never summed).
//  3. Remaining stats add normally.
//
// Instant effects (Energy / Health EXP) are metadata, not persistent stats, and
// are skipped. ConditionType is a trigger (on-hit/on-crit), not a stacking key.
func addConsumables(a *accumulator, items []*model.Item) {
	type activeMod struct {
		mod    model.StatMod
		source string
	}
	var active []activeMod

	for _, it := range items {
		if it == nil || it.Effects == nil {
			continue
		}
		if clears := it.Effects.ClearsBuffCategories; len(clears) > 0 {
			active = slices.DeleteFunc(active, func(e activeMod) bool {
				return e.mod.BuffCategory != 0 && slices.Contains(clears, e.mod.BuffCategory)
			})
		}
		for _, sm := range it.Effects.Stats.Stats {
			if sm.EffectDsl != nil || sm.Instant {
				continue
			}
			if sm.StatID == "" && len(sm.StatIDs) == 0 {
				continue
			}
			if sm.BuffGroup != 0 {
				active = slices.DeleteFunc(active, func(e activeMod) bool {
					return e.mod.BuffGroup == sm.BuffGroup
				})
			}
			active = append(active, activeMod{mod: sm, source: it.Name})
		}
	}

	for _, e := range active {
		value := e.mod.Value
		if e.mod.Op == "-" {
			value = -value
		}
		if e.mod.StatID != "" {
			a.add(e.mod.StatID, value, e.source)
		}
		for _, id := range e.mod.StatIDs {
			a.add(id, value, e.source)
		}
	}
}

// addCrystals folds socket-crystal Effects into the sheet. Crystals stack (no
// buff-group clear/replace); Instant rows are skipped like consumables.
func addCrystals(a *accumulator, items []*model.Item) {
	for _, it := range items {
		if it == nil || it.Effects == nil {
			continue
		}
		for _, sm := range it.Effects.Stats.Stats {
			if sm.EffectDsl != nil || sm.Instant {
				continue
			}
			if sm.StatID == "" && len(sm.StatIDs) == 0 {
				continue
			}
			value := sm.Value
			if sm.Op == "-" {
				value = -value
			}
			if sm.StatID != "" {
				a.add(sm.StatID, value, it.Name)
			}
			for _, id := range sm.StatIDs {
				a.add(id, value, it.Name)
			}
		}
	}
}

func addFitness(a *accumulator, f Fitness) {
	c := model.GenFitnessCurves
	a.add(model.StatIds.WeightLimit, curveAt(c.WeightLimit, f.Strength), "Fitness Strength")
	a.add(model.StatIds.MaxStamina, curveAt(c.MaxStamina, f.Breath), "Fitness Breath")
	a.add(model.StatIds.MaxHp, curveAt(c.MaxHP, f.Health), "Fitness Health")
	a.add(model.StatIds.MaxResource, curveAt(c.MaxResource, f.Health), "Fitness Health")
}

// addBaseKit is the flat kit every character gets ("Happy Black Spirit").
func addBaseKit(a *accumulator) {
	const src = "Happy Black Spirit"
	for _, k := range []model.StatId{model.StatIds.Ap, model.StatIds.ApMin, model.StatIds.ApMax, model.StatIds.AwakeningAp, model.StatIds.AwakeningApMin, model.StatIds.AwakeningApMax} {
		a.add(k, 1, src)
	}
	a.add(model.StatIds.Dp, 1, src)
	a.add(model.StatIds.DamageReduction, 1, src)
	a.add(model.StatIds.MaxHp, 30, src)
	a.add(model.StatIds.MaxResource, 10, src)
	a.add(model.StatIds.MaxStamina, 20, src)
	a.add(model.StatIds.Accuracy, 4, src)
	a.add(model.StatIds.Evasion, 4, src)
	a.add(model.StatIds.WeightLimit, 20, src)
}

// addClass folds the class's base hidden stats and its per-level curves at the
// character's level.
func addClass(a *accumulator, c model.ClassStat, level int) {
	const src = "Class"
	a.add(model.StatIds.Accuracy, float64(model.BaseAccuracy), src)
	a.add(model.StatIds.MaxStamina, float64(model.BaseStamina), src)
	for _, k := range []model.StatId{model.StatIds.GrappleResistance, model.StatIds.KnockbackResistance, model.StatIds.KnockdownResistance, model.StatIds.StunResistance} {
		a.add(k, float64(model.BaseCCResistance), src)
	}
	a.add(model.StatIds.HiddenEvasion, float64(c.HiddenEvasion), src)
	for _, k := range []model.StatId{model.StatIds.HiddenMeleeDamageReduction, model.StatIds.HiddenRangedDamageReduction, model.StatIds.HiddenMagicDamageReduction} {
		a.add(k, float64(c.HiddenDamageReduction), src)
	}
	i := level - 1
	a.add(model.StatIds.HiddenAp, curveAtInt(c.PerLevel.HiddenAP, i), src)
	a.add(model.StatIds.MaxHp, curveAtInt(c.PerLevel.MaxHP, i), src)
	a.add(model.StatIds.MaxResource, curveAtInt(c.PerLevel.MaxResource, i), src)
	a.add(model.StatIds.WeightLimit, curveAtInt(c.PerLevel.WeightLimit, i), src)
}

func addLevelMilestones(a *accumulator, level int) {
	if level >= 60 {
		for _, k := range []model.StatId{
			model.StatIds.Ap,
			model.StatIds.ApMin,
			model.StatIds.ApMax,
			model.StatIds.AwakeningAp,
			model.StatIds.AwakeningApMin,
			model.StatIds.AwakeningApMax,
		} {
			a.add(k, 1, "Level 60")
		}
	}
	if level >= 56 {
		a.add(model.StatIds.Dp, 1, "Level 56")
		a.add(model.StatIds.DamageReduction, 1, "Level 56")
	}
}

// gatheringToolSlots are the six CP gathering tools. Their gathering time /
// drop-rate stats are "best tool wins", not summed.
var gatheringToolSlots = map[model.SlotName]bool{
	model.SlotNameLumberingAxe:   true,
	model.SlotNameFluidCollector: true,
	model.SlotNameHoe:            true,
	model.SlotNameButcherKnife:   true,
	model.SlotNameTanningKnife:   true,
	model.SlotNamePickaxe:        true,
}

// addGear folds every equipped piece's enhancement + Caphras stats.
func addGear(a *accumulator, slots []Slot) {
	var g gatheringBest
	for i := range slots {
		s := &slots[i]
		if s.Item == nil || s.Enhancement == nil {
			continue
		}
		name := s.Item.Name
		addEnchantFlats(a, s.Id, s.Enhancement, name)
		if gatheringToolSlots[s.Id] {
			addGatheringToolEffects(a, s.Enhancement.Effects, name, &g)
		} else {
			addEffects(a, s.Enhancement.Effects, name)
		}
		if s.Caphras != nil {
			addCaphras(a, s.Id, s.Caphras, name+": Caphras")
		}
	}
	g.apply(a)
}

// addCaphras folds a piece's Caphras step stats. It reads the decoded typed stat
// block (model.CaphrasStats) directly — the effects DSL on the level is derived
// from these same eight values. AP is slot-routed like the enchant; the rest map
// 1:1 to their StatId. a.add skips zero values. Visible evasion/DR also feed DP
// (mirroring the enchant's e.Dp); the hidden portions do not.
func addCaphras(a *accumulator, slot model.SlotName, caph *model.CaphrasLevel, name string) {
	s := caph.Stats
	if s.AP != 0 {
		addSlotAp(a, slot, s.AP, s.AP, s.AP, name)
	}
	a.add(model.StatIds.Accuracy, s.Accuracy, name)
	a.add(model.StatIds.Evasion, s.Evasion, name)
	a.add(model.StatIds.HiddenEvasion, s.HiddenEvasion, name)
	a.add(model.StatIds.DamageReduction, s.DamageReduction, name)
	a.add(model.StatIds.HiddenDamageReduction, s.HiddenDamageReduction, name)
	a.add(model.StatIds.MaxHp, s.MaxHP, name)
	a.add(model.StatIds.MaxResource, float64(s.MaxMP), name)
	a.add(model.StatIds.Dp, s.Evasion, name)
	a.add(model.StatIds.Dp, s.DamageReduction, name)
}

// gatheringBest keeps the single best gathering-time reduction and drop-rate
// across equipped tools — only the best of each applies, they don't stack.
type gatheringBest struct {
	time     float64
	drop     float64
	timeName string
	dropName string
	hasTime  bool
	hasDrop  bool
}

// addGatheringToolEffects applies a tool's effects normally except gathering
// time / drop rate, which feed the best-of tracker instead of summing.
func addGatheringToolEffects(a *accumulator, groups []model.EffectGroup, name string, g *gatheringBest) {
	for _, grp := range groups {
		if isSetEffect(grp.Title) {
			continue
		}
		for _, sm := range grp.Stats {
			if enchantNumericDupes[sm.Func] {
				continue
			}
			switch stat, v, ok := statModTarget(sm); {
			case ok && stat == model.StatIds.GatheringTime: // more negative = bigger reduction
				if !g.hasTime || v < g.time {
					g.time, g.timeName, g.hasTime = v, name, true
				}
			case ok && stat == model.StatIds.GatheringDropRate:
				if !g.hasDrop || v > g.drop {
					g.drop, g.dropName, g.hasDrop = v, name, true
				}
			default:
				addStatMod(a, sm, name)
			}
		}
	}
}

// apply folds the base gathering time and the single best tool bonuses.
func (g *gatheringBest) apply(a *accumulator) {
	a.add(model.StatIds.GatheringTime, 3, "Base Gathering Time")
	if g.hasTime {
		a.add(model.StatIds.GatheringTime, g.time, g.timeName)
	}
	if g.hasDrop {
		a.add(model.StatIds.GatheringDropRate, g.drop, g.dropName)
	}
}

// addSlotAp routes an AP value to the AP dice by slot: main weapon feeds the
// succession dice, awakening weapon the awakening dice, everything else both.
func addSlotAp(a *accumulator, slot model.SlotName, ap, mn, mx float64, name string) {
	switch slot {
	case model.SlotNameMainWeapon:
		a.add(model.StatIds.Ap, ap, name)
		a.add(model.StatIds.ApMin, mn, name)
		a.add(model.StatIds.ApMax, mx, name)
	case model.SlotNameAwakeningWeapon:
		a.add(model.StatIds.AwakeningAp, ap, name)
		a.add(model.StatIds.AwakeningApMin, mn, name)
		a.add(model.StatIds.AwakeningApMax, mx, name)
	default: // sub-weapon, armor, accessories feed AP and AAP alike
		a.add(model.StatIds.Ap, ap, name)
		a.add(model.StatIds.AwakeningAp, ap, name)
		a.add(model.StatIds.ApMin, mn, name)
		a.add(model.StatIds.ApMax, mx, name)
		a.add(model.StatIds.AwakeningApMin, mn, name)
		a.add(model.StatIds.AwakeningApMax, mx, name)
	}
}

// addEnchantFlats adds an enchant level's flat stats with slot-specific AP routing.
func addEnchantFlats(a *accumulator, slot model.SlotName, e *model.EnchantLevel, name string) {
	ap, mn, mx := float64(e.Ap), float64(e.ApMin), float64(e.ApMax)
	if mn == 0 && mx == 0 {
		mn, mx = ap, ap // accessories carry a single AP value, no min/max range
	}
	addSlotAp(a, slot, ap, mn, mx, name)

	a.add(model.StatIds.Accuracy, float64(e.Accuracy), name)
	// Visible evasion/DR feed the leaf stat directly; the "(+N)" added portion is
	// hidden evasion/DR, which fans back into the totals.
	a.add(model.StatIds.Evasion, float64(e.Evasion), name)
	a.add(model.StatIds.HiddenEvasion, float64(e.AddedEvasion), name)
	a.add(model.StatIds.DamageReduction, float64(e.DamageReduction), name)
	a.add(model.StatIds.HiddenDamageReduction, float64(e.AddedDamageReduction), name)
	// DP is visible evasion + visible DR only (e.Dp); the hidden "(+N)" added
	// portions do not count toward the DP that drives the brackets.
	a.add(model.StatIds.Dp, float64(e.Dp), name)
	a.add(model.StatIds.MaxHp, float64(e.MaxHP), name)
}

// enchantNumericDupes are DSL funcs whose value the numeric enchant field
// (e.MaxHP, e.Accuracy) already captures, so routing them in enchant effects
// double-counts. They still apply in caphras (no numeric field backs them there)
// and in set effects (a real, conditional bonus).
var enchantNumericDupes = map[string]bool{
	"HP_UP":      true, // e.MaxHP covers it
	"ALL_HIT_UP": true, // e.Accuracy covers it
}

// addEffects routes each DSL effect line to its gear stat. Set-effect groups are
// skipped here — they're gated on set membership in addSetEffects.
func addEffects(a *accumulator, groups []model.EffectGroup, name string) {
	for _, g := range groups {
		if isSetEffect(g.Title) {
			continue
		}
		for _, sm := range g.Stats {
			if enchantNumericDupes[sm.Func] {
				continue
			}
			addStatMod(a, sm, name)
		}
	}
}

// addStatMod routes one DSL effect line to its gear stat via the
// effect_funcs.yml enum. Dual funcs feed both of their stats one value.
func addStatMod(a *accumulator, sm model.StatMod, name string) {
	if sm.EffectDsl == nil || sm.Func == "" {
		return
	}
	if info, ok := model.EffectFuncStat(sm.Func).TryGetInfo(); ok && len(info.Stats) > 0 {
		value := sm.Value
		if info.Negate {
			value = -value
		}
		for _, stat := range info.Stats {
			a.add(stat, value, name)
		}
		return
	}
	if stat, value, ok := statModTarget(sm); ok {
		a.add(stat, value, name)
	}
}

// statModTarget resolves a single effect line to the stat it feeds and its
// signed value. ok is false for unrouted or dual funcs (duals are applied in
// addStatMod). Routing comes from the effect_funcs.yml enum.
func statModTarget(sm model.StatMod) (model.StatId, float64, bool) {
	if sm.EffectDsl == nil || sm.Func == "" {
		return "", 0, false
	}
	info, ok := model.EffectFuncStat(sm.Func).TryGetInfo()
	if !ok || len(info.Stats) > 0 || info.Stat == "" {
		return "", 0, false
	}
	value := sm.Value
	if info.Negate {
		value = -value
	}
	return info.Stat, value, true
}

// setEffectFuncs whose value is an "all AP" grant. These stay OUT of the global
// func routing (ALL_AP_UP also appears as a regular effect where the enchant's
// own AP may already cover it), so they're applied only inside set effects.
var setFlatApFuncs = map[string]bool{"ALL_AP_UP": true, "ALL_AP_INCRE": true}

// addSetEffects applies "Set Effect (N-piece)" bonuses gated on how many equipped
// pieces share an item set. Every piece of a set carries identical set-effect
// groups, so each tier is applied once (from whichever member piece carries it)
// for every tier whose piece requirement the equipped count meets.
func addSetEffects(a *accumulator, slots []Slot) {
	counts := map[string]int{}
	for i := range slots {
		if s := &slots[i]; s.Item != nil && s.Item.ItemSets != nil {
			for _, u := range s.Item.ItemSets.URNs {
				counts[u.String()]++
			}
		}
	}
	for setKey, count := range counts {
		applied := map[int]bool{}
		for i := range slots {
			s := &slots[i]
			if s.Item == nil || s.Enhancement == nil || s.Item.ItemSets == nil || !itemInSet(s.Item, setKey) {
				continue
			}
			for _, g := range s.Enhancement.Effects {
				pieces, ok := setEffectPieces(g.Title)
				if !ok || pieces > count || applied[pieces] {
					continue
				}
				applied[pieces] = true
				name := s.Item.Name + ": " + g.Title
				for _, sm := range g.Stats {
					if sm.EffectDsl != nil && setFlatApFuncs[sm.Func] {
						addFlatAp(a, sm.Value, name)
						continue
					}
					addStatMod(a, sm, name)
				}
			}
		}
	}
}

// addFlatAp adds a non-slot-specific "all AP" grant to both the main and
// awakening AP dice (mirrors addEnchantFlats' accessory/armor branch).
func addFlatAp(a *accumulator, v float64, name string) {
	a.add(model.StatIds.Ap, v, name)
	a.add(model.StatIds.ApMin, v, name)
	a.add(model.StatIds.ApMax, v, name)
	a.add(model.StatIds.AwakeningAp, v, name)
	a.add(model.StatIds.AwakeningApMin, v, name)
	a.add(model.StatIds.AwakeningApMax, v, name)
}

// itemInSet reports whether the item belongs to the given item-set urn.
func itemInSet(item *model.Item, setKey string) bool {
	for _, u := range item.ItemSets.URNs {
		if u.String() == setKey {
			return true
		}
	}
	return false
}

// setEffectPieces parses the piece requirement out of a "Set Effect (N-piece)"
// group title. Untiered "Set Effect" groups return 1 (a single piece triggers).
var setEffectPieceRe = regexp.MustCompile(`\((\d+)-piece\)`)

func setEffectPieces(title string) (int, bool) {
	if !isSetEffect(title) {
		return 0, false
	}
	if m := setEffectPieceRe.FindStringSubmatch(title); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n, true
	}
	return 1, true
}

// applyBrackets applies the AP/DP/DR bracket bonuses (fed back through the
// fan-out) and the 310+ monster-AP softcaps.
func applyBrackets(a *accumulator) {
	ap := math.Floor((a.total(model.StatIds.ApMin) + a.total(model.StatIds.ApMax)) / 2)
	aap := math.Floor((a.total(model.StatIds.AwakeningApMin) + a.total(model.StatIds.AwakeningApMax)) / 2)
	dp := a.total(model.StatIds.Dp)

	for _, br := range model.GenBrackets.AP {
		if inBracket(ap, br) {
			a.add(model.StatIds.BracketAp, float64(br.Bonus), "Brackets")
		}
		if inBracket(aap, br) {
			a.add(model.StatIds.BracketAwakeningAp, float64(br.Bonus), "Brackets")
		}
	}
	for _, br := range model.GenBrackets.DP {
		if inBracket(dp, br) {
			a.add(model.StatIds.DamageReductionRate, float64(br.Bonus), "Brackets")
		}
	}
	for _, br := range model.GenBrackets.DR {
		if inBracket(dp, br) {
			a.add(model.StatIds.DamageReduction, float64(br.Bonus), "Brackets")
			break // only the top matching DR bracket applies
		}
	}
	if aap >= 310 {
		a.add(model.StatIds.BracketMonsterAwakeningAp, (aap-309)*8, "Monster AAP Brackets")
	}
	if ap >= 310 {
		a.add(model.StatIds.BracketMonsterAp, (ap-309)*8, "Monster AP Brackets")
	}
}

// critChanceByLevel maps the 0-5 Critical Hit level to its hit-chance %.
var critChanceByLevel = []float64{0, 5, 9, 12, 15, 18}

// deriveCritChance turns accumulated Critical Hit level into a hit-chance %,
// clamped to the 0-5 level cap the game enforces. Crit level is always integral
// (CRI_POINT/CRI_ADD add whole levels)
func deriveCritChance(a *accumulator) {
	lvl := int(a.total(model.StatIds.CritLevel))
	if lvl < 0 {
		lvl = 0
	}
	if lvl >= len(critChanceByLevel) {
		lvl = len(critChanceByLevel) - 1
	}
	if chance := critChanceByLevel[lvl]; chance > 0 {
		a.add(model.StatIds.CritChance, chance, "Critical Hit")
	}
}

func derive(a *accumulator) *StatSheet {
	// Gathering time floors at 1 second.
	if v := a.stats[model.StatIds.GatheringTime]; v != nil && v.Total < 1 {
		v.Total = 1
	}
	ap := math.Floor((a.total(model.StatIds.ApMin) + a.total(model.StatIds.ApMax)) / 2)
	aap := math.Floor((a.total(model.StatIds.AwakeningApMin) + a.total(model.StatIds.AwakeningApMax)) / 2)
	return &StatSheet{
		AP:    int(ap),
		AAP:   int(aap),
		DP:    int(a.total(model.StatIds.Dp)),
		Stats: a.stats,
	}
}

func isSetEffect(title string) bool {
	return strings.Contains(title, "Set Effect")
}

func curveAt(curve []float64, i int) float64 {
	if i < 0 || i >= len(curve) {
		return 0
	}
	return curve[i]
}

func curveAtInt(curve []int, i int) float64 {
	if i < 0 || i >= len(curve) {
		return 0
	}
	return float64(curve[i])
}

func inBracket(v float64, b model.Bracket) bool {
	return v >= float64(b.Low) && v <= float64(b.High)
}
