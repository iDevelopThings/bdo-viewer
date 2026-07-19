package gear

import (
	"sort"
	"strings"
	"testing"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

// fanoutGolden is a snapshot of the entire StatId fanout graph (stats.yml). The
// accumulator propagates every contribution down these edges, so an accidental
// edit (e.g. adding `ap` to an umbrella's fanout) silently changes every stat's
// total. This test pins the graph: if it fails, a fanout edge changed — confirm
// it's intentional AND that TestFanoutNoDoubleCount still passes, then paste the
// reported "got" block here.
const fanoutGolden = `adventurerAp: apVsAdventurer,awakeningApVsAdventurer
allMastery: alchemyMastery,cookingMastery,farmingMastery,fishingMastery,gatheringMastery,huntingMastery,processingMastery,sailingMastery,tradingMastery,trainingMastery
allResistance: grappleResistance,knockbackResistance,knockdownResistance,stunResistance
allSpeciesAp: demihumanAp,edaniaAp,humanAp,kamasylvianAp,normalAp
ap: totalAp
awakeningAp: totalAwakeningAp
bracketAp: totalAp
bracketAwakeningAp: totalAwakeningAp
bracketMonsterAp: apVsDemihuman,apVsEdania,apVsHuman,apVsKamasylvian,apVsMonster,apVsNormal
bracketMonsterAwakeningAp: awakeningApVsDemihuman,awakeningApVsEdania,awakeningApVsHuman,awakeningApVsKamasylvian,awakeningApVsMonster,awakeningApVsNormal
damageReduction: magicDamageReduction,magicMonsterDamageReduction,meleeDamageReduction,meleeMonsterDamageReduction,rangedDamageReduction,rangedMonsterDamageReduction
demihumanAp: apVsDemihuman,awakeningApVsDemihuman
edaniaAp: apVsEdania,awakeningApVsEdania
evasion: magicEvasion,meleeEvasion,rangedEvasion
evasionRate: magicEvasionRate,meleeEvasionRate,rangedEvasionRate
gatheringMastery: butcherMastery,fluidCollectorMastery,hoeMastery,lumberingMastery,pickaxeMastery,tanningMastery
hiddenAp: totalAp,totalAwakeningAp
hiddenDamageReduction: magicDamageReduction,magicMonsterDamageReduction,meleeDamageReduction,meleeMonsterDamageReduction,rangedDamageReduction,rangedMonsterDamageReduction
hiddenEvasion: evasion
hiddenMagicDamageReduction: magicDamageReduction,magicMonsterDamageReduction
hiddenMagicEvasion: magicEvasion
hiddenMeleeDamageReduction: meleeDamageReduction,meleeMonsterDamageReduction
hiddenMeleeEvasion: meleeEvasion
hiddenRangedDamageReduction: rangedDamageReduction,rangedMonsterDamageReduction
hiddenRangedEvasion: rangedEvasion
humanAp: apVsHuman,awakeningApVsHuman
ignoreAllResistance: ignoreGrappleResistance,ignoreKnockbackResistance,ignoreKnockdownResistance,ignoreStunResistance
kamasylvianAp: apVsKamasylvian,awakeningApVsKamasylvian
magicAccuracy: accuracy
meleeAccuracy: accuracy
monsterAp: apVsDemihuman,apVsEdania,apVsHuman,apVsKamasylvian,apVsMonster,apVsNormal,awakeningApVsDemihuman,awakeningApVsEdania,awakeningApVsHuman,awakeningApVsKamasylvian,awakeningApVsMonster,awakeningApVsNormal
monsterDamageReduction: magicMonsterDamageReduction,meleeMonsterDamageReduction,rangedMonsterDamageReduction
normalAp: apVsNormal,awakeningApVsNormal
processingMastery: choppingMastery,dryingMastery,filteringMastery,grindingMastery,heatingMastery,shakingMastery
rangedAccuracy: accuracy
specialAttackDamage: airAttackDamage,backAttackDamage,counterAttackDamage,critDamage,downAttackDamage,speedAttackDamage
totalAp: apVsAdventurer,apVsDemihuman,apVsEdania,apVsHuman,apVsKamasylvian,apVsMonster,apVsNormal
totalAwakeningAp: awakeningApVsAdventurer,awakeningApVsDemihuman,awakeningApVsEdania,awakeningApVsHuman,awakeningApVsKamasylvian,awakeningApVsMonster,awakeningApVsNormal
totalDamageReduction: magicDamageReduction,magicMonsterDamageReduction,meleeDamageReduction,meleeMonsterDamageReduction,rangedDamageReduction,rangedMonsterDamageReduction`

// fanoutLines renders the current StatId fanout graph in the golden's canonical
// form: one "stat: sortedChildren" line per fanout-bearing stat, lines sorted.
func fanoutLines() string {
	var lines []string
	for _, info := range model.StatIds.Infos() {
		if len(info.Fanout) == 0 {
			continue
		}
		kids := make([]string, len(info.Fanout))
		for i, k := range info.Fanout {
			kids[i] = string(k)
		}
		sort.Strings(kids)
		lines = append(lines, string(info.StatId)+": "+strings.Join(kids, ","))
	}
	sort.Strings(lines)
	return strings.Join(lines, "\n")
}

// TestFanoutGraphSnapshot locks the fanout graph so a stats.yml edit can't
// silently change stat propagation.
func TestFanoutGraphSnapshot(t *testing.T) {
	if got := fanoutLines(); got != fanoutGolden {
		t.Errorf("StatId fanout graph changed — confirm it's intentional, then update fanoutGolden.\n--- got ---\n%s\n--- want ---\n%s", got, fanoutGolden)
	}
}

// TestFanoutAcyclic guards against a fanout cycle, which would infinite-loop the
// accumulator's recursive add().
func TestFanoutAcyclic(t *testing.T) {
	const white, gray, black = 0, 1, 2
	color := map[model.StatId]int{}

	var visit func(model.StatId, []string)
	visit = func(n model.StatId, path []string) {
		color[n] = gray
		for _, c := range n.Info().Fanout {
			switch color[c] {
			case gray:
				t.Fatalf("fanout cycle: %s -> %s", strings.Join(append(path, string(n)), " -> "), c)
			case white:
				visit(c, append(path, string(n)))
			}
		}
		color[n] = black
	}
	for _, info := range model.StatIds.Infos() {
		if color[info.StatId] == white {
			visit(info.StatId, nil)
		}
	}
}

// TestFanoutNoDoubleCount is the invariant behind the "doubling" class of bug:
// adding a value to any single stat must reach every other stat at most once. A
// diamond in the fanout graph (two paths from one node to another) would make a
// downstream stat receive the value 2× — exactly what a bad fanout edit causes.
func TestFanoutNoDoubleCount(t *testing.T) {
	infos := model.StatIds.Infos()
	for _, src := range infos {
		a := newAccumulator("")
		a.add(src.StatId, 1, "test")
		for _, dst := range infos {
			if got := a.total(dst.StatId); got != 0 && got != 1 {
				t.Errorf("adding 1 to %s made %s = %v (want 0 or 1) — the fanout graph has a double-count path", src.StatId, dst.StatId, got)
			}
		}
	}
}
