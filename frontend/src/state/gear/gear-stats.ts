import {CaphrasLevel, EffectGroup, EnchantLevel, Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GEAR_SLOTS, type GearSlotDef} from "@/state/gear/gear-slots.ts";
import {
	AP_STAT_KEYS,
	type ApStatKey,
	effectFuncInfo,
	FLAT_STAT_KEYS,
	type FlatStatKey,
	statModStats,
} from "@/lib/effect-dsl.ts";

// Species AP bonuses split the way sheet AP does: "ap"-mode slots (main
// weapon) only feed the succession rows, "aap" slots (awakening weapon) only
// the awakening rows, everything else feeds both.
type ApBucket = { ap: number, aap: number };

type StatAcc =
	Record<FlatStatKey, number>
	& Record<ApStatKey | "apMin" | "apMax", ApBucket>;

function emptyAcc(): StatAcc {
	const acc = {} as StatAcc;
	for (const key of FLAT_STAT_KEYS) {
		acc[key] = 0;
	}
	for (const key of [...AP_STAT_KEYS, "apMin", "apMax"] as const) {
		acc[key] = {ap : 0, aap : 0};
	}
	return acc;
}

function addBucket(bucket: ApBucket, def: GearSlotDef, value: number) {
	if (def.apMode === "ap" || def.apMode === "both")
		bucket.ap += value;
	if (def.apMode === "aap" || def.apMode === "both")
		bucket.aap += value;
}

export type StatRow = { label: string, value: string };
export type StatSection = { title: string, rows: StatRow[] };

export type GearTotals = { ap: number, aap: number, dp: number };
export type GearStatsResult = { sections: StatSection[], totals: GearTotals };

type ItemLookup = {
	itemFor(slotId: string): Item | undefined;
	enchantFor(slotId: string): EnchantLevel | undefined;
	caphrasFor(slotId: string): CaphrasLevel | undefined;
};

// applyEffectGroups folds enhancement/Caphras DSL effect groups (same shape) into the
// accumulator. Set/wear bonuses only apply with a full set worn, which this aggregator
// doesn't verify, so groups titled as a set bonus are skipped.
function applyEffectGroups(acc: StatAcc, def: GearSlotDef, groups: readonly EffectGroup[] | null | undefined) {
	for (const group of groups ?? []) {
		if (group.title?.includes("Set Effect")) {
			continue;
		}
		for (const effect of group.stats ?? []) {
			const func = effect.func;
			if (!func) {
				continue;
			}
			const arg = effect.args?.[0];
			if (arg === undefined) {
				continue;
			}
			const info = effectFuncInfo(func);
			if (!info) {
				continue;
			}
			const value = info.negate ? -arg : arg;
			if (info.apStat) {
				addBucket(acc[info.apStat], def, value);
			} else if (info.stat) {
				acc[info.stat] += value;
			}
		}
	}
}

export function aggregateGearStats(lookup: ItemLookup): GearStatsResult {
	const acc = emptyAcc();

	for (const def of GEAR_SLOTS) {
		const item = lookup.itemFor(def.id);
		if (!item)
			continue;

		const enchant = lookup.enchantFor(def.id);
		if (enchant) {
			addBucket(acc.apMin, def, enchant.apMin ?? enchant.ap ?? 0);
			addBucket(acc.apMax, def, enchant.apMax ?? enchant.ap ?? 0);

			acc.dp              += enchant.dp ?? 0;
			acc.evasion         += enchant.evasion ?? 0;
			acc.damageReduction += enchant.damageReduction ?? 0;
			acc.hp              += enchant.maxHp ?? 0;

			applyEffectGroups(acc, def, enchant.effects);
		}

		// Caphras adds its step's total stats on top of the enhancement level, in the
		// same DSL shape.
		const caphras = lookup.caphrasFor(def.id);
		if (caphras) {
			applyEffectGroups(acc, def, caphras.effects);
		}

		// Alchemy stones and life gear carry their stats as StatMod buffs
		// instead of (or in addition to) the enhancement DSL.
		const mods = [...(item.effects?.stats?.stats ?? []), ...(item.effects?.hidden?.stats ?? [])];
		for (const mod of mods) {
			const info = statModStats[mod.stat ?? ""];
			if (!info)
				continue;

			const value = (mod.value ?? 0) * (mod.op === "-" ? -1 : 1);
			if (info.apStat) {
				addBucket(acc[info.apStat], def, value);
			} else if (info.stat) {
				acc[info.stat] += value;
			}
		}
	}

	const apTotal = (kind: "ap" | "aap") =>
		Math.round((acc.apMin[kind] + acc.apMax[kind]) / 2) + acc.allAp[kind] + acc.allSpeciesAp[kind];

	return {
		sections : buildSections(acc),
		totals   : {ap : apTotal("ap"), aap : apTotal("aap"), dp : acc.dp},
	};
}

function apRange(min: number, max: number, bonus: number): string {
	const lo = min + bonus;
	const hi = max + bonus;
	return lo === hi ? `${lo}` : `${lo} ~ ${hi}`;
}

function buildSections(acc: StatAcc): StatSection[] {
	const num     = (v: number): string => `${v}`;
	const percent = (v: number): string => `${v}%`;

	const apRows = (kind: "ap" | "aap"): StatRow[] => {
		const min  = acc.apMin[kind];
		const max  = acc.apMax[kind];
		const base = acc.allAp[kind] + acc.allSpeciesAp[kind];
		return [
			{label : kind === "ap" ? "Total Attack AP" : "Total Awakening AP", value : apRange(min, max, base)},
			{label : kind === "ap" ? "Monster AP" : "Monster AAP", value : apRange(min, max, base + acc.monsterAp[kind] + acc.nonHumanAp[kind])},
			{label : kind === "ap" ? "Human AP" : "Human AAP", value : apRange(min, max, base + acc.humanAp[kind])},
			{label : kind === "ap" ? "Kamasylvian AP" : "Kamasylvian AAP", value : apRange(min, max, base + acc.kamaAp[kind] + acc.nonHumanAp[kind])},
			{label : kind === "ap" ? "Edania AP" : "Edania AAP", value : apRange(min, max, base + acc.ahibAp[kind] + acc.nonHumanAp[kind])},
		];
	};

	return [
		{title : "Offense (Succession)", rows : apRows("ap")},
		{title : "Offense (Awakening)", rows : apRows("aap")},
		{
			title : "Offense",
			rows  : [
				{label : "All Accuracy", value : num(acc.accuracy)},
				{label : "Attack Speed", value : num(acc.attackSpeed)},
				{label : "Casting Speed", value : num(acc.castSpeed)},
				{label : "Critical Hit", value : num(acc.crit)},
				{label : "Critical Hit Damage", value : percent(acc.critDamage)},
				{label : "Special Attack Damage", value : percent(acc.specialDamage)},
			]
		},
		{
			title : "Defense",
			rows  : [
				{label : "Total DP", value : num(acc.dp)},
				{label : "Damage Reduction", value : num(acc.damageReduction)},
				{label : "Evasion", value : num(acc.evasion)},
				{label : "Monster Damage Reduction", value : num(acc.monsterDr)},
				{label : "Monster Damage Reduction Rate", value : percent(acc.monsterDrRate)},
			]
		},
		{
			title : "Basic",
			rows  : [
				{label : "Max HP", value : num(acc.hp)},
				{label : "Max MP/WP/SP", value : num(acc.mp)},
				{label : "Max Stamina", value : num(acc.stamina)},
				{label : "HP Recovery on Hit", value : num(acc.hpRecovOnHit)},
			]
		},
		{
			title : "Resistance",
			rows  : [
				{label : "All Resistance", value : percent(acc.allResist)},
				{label : "Stun/Stiffness/Freezing", value : percent(acc.stunResist)},
				{label : "Knockdown/Bound", value : percent(acc.kdResist)},
				{label : "Knockback/Floating", value : percent(acc.kbResist)},
			]
		},
		{
			title : "Life Mastery",
			rows  : [
				{label : "All Life Mastery", value : num(acc.allMastery)},
				{label : "Gathering Mastery", value : num(acc.gatherMastery)},
				{label : "Fishing Mastery", value : num(acc.fishMastery)},
				{label : "Hunting Mastery", value : num(acc.huntMastery)},
				{label : "Cooking Mastery", value : num(acc.cookMastery)},
				{label : "Alchemy Mastery", value : num(acc.alchemyMastery)},
				{label : "Processing Mastery", value : num(acc.processMastery)},
				{label : "Training Mastery", value : num(acc.trainMastery)},
				{label : "Sailing Mastery", value : num(acc.sailMastery)},
			]
		},
		{
			title : "Life",
			rows  : [
				{label : "Gathering Speed", value : num(acc.gatherSpeed)},
				{label : "Gathering Time Reduction", value : num(acc.gatherTime)},
				{label : "Gathering Item Drop Rate", value : percent(acc.gatherDropRate)},
				{label : "Fishing Speed", value : num(acc.fishSpeed)},
				{label : "Processing Success Rate", value : percent(acc.processSuccess)},
				{label : "Cooking Time", value : `${acc.cookTime} sec`},
				{label : "Alchemy Time", value : `${acc.alchTime} sec`},
				{label : "Life EXP", value : percent(acc.lifeExp)},
			]
		},
		{
			title : "Other",
			rows  : [
				{label : "Movement Speed", value : num(acc.moveSpeed)},
				{label : "Luck", value : num(acc.luck)},
				{label : "Weight Limit", value : `${acc.weightLimit} LT`},
				{label : "Combat EXP", value : percent(acc.combatExp)},
				{label : "Skill EXP", value : percent(acc.skillExp)},
				{label : "Item Drop Rate", value : percent(acc.itemDropRate)},
				{label : "Death Penalty Reduction", value : percent(acc.deathPenalty)},
				{label : "Amity Gain", value : percent(acc.amity)},
			]
		},
	];
}
