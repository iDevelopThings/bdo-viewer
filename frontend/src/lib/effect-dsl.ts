// Single registry for the item effect DSL: per-function metadata for the gear
// builder's cross-item stat aggregation (state/gear/gear-stats.ts reads
// stat/apStat). Display sections (bdoextract's EffectGroup.Title) and set/wear
// bonus detection are resolved server-side now - see internal/stats.

// Species-AP stats follow the sheet AP split (succession vs awakening buckets).
export const AP_STAT_KEYS = [
	"allAp", "monsterAp", "humanAp", "allSpeciesAp", "nonHumanAp", "ahibAp", "kamaAp",
] as const;
export type ApStatKey = typeof AP_STAT_KEYS[number];

export const FLAT_STAT_KEYS = [
	"dp", "evasion", "damageReduction", "monsterDr", "monsterDrRate",
	"hp", "mp", "stamina", "hpRecovOnHit",
	"accuracy", "attackSpeed", "castSpeed", "crit", "critDamage", "specialDamage",
	"allResist", "stunResist", "kdResist", "kbResist",
	"moveSpeed", "luck", "combatExp", "skillExp", "deathPenalty", "amity", "weightLimit", "itemDropRate",
	"gatherTime", "gatherSpeed", "fishSpeed", "cookTime", "alchTime",
	"processSuccess", "gatherDropRate", "lifeExp",
	"allMastery", "gatherMastery", "fishMastery", "huntMastery", "cookMastery",
	"alchemyMastery", "processMastery", "trainMastery", "sailMastery",
] as const;
export type FlatStatKey = typeof FLAT_STAT_KEYS[number];

export type EffectFuncInfo = {
	label: string;
	unit?: string;
	stat?: FlatStatKey;
	apStat?: ApStatKey;
	// "..._DOWN" funcs carry positive args but reduce the stat (time costs).
	negate?: boolean;
};

export const effectFuncs: Record<string, EffectFuncInfo> = {
	MONSTER_DAM_ADD                 : {label : "Extra AP Against Monsters", apStat : "monsterAp"},
	PLAYER_DAM_ADD                  : {label : "Extra AP Against Adventurers", apStat : "humanAp"},
	P_H_DAM_ADD                     : {label : "Extra AP Against All", apStat : "allSpeciesAp"},
	P_M_DAM_ADD                     : {label : "Extra AP Against All", apStat : "allSpeciesAp"},
	ALL_TRIBE_DAM_ADD_NOHUMAN       : {label : "Extra AP Against All (except Humans)", apStat : "nonHumanAp"},
	ALL_TRIBE_DAM_ADD_NOHUMAN_NOAIN : {label : "Extra AP Against All (except Humans)", apStat : "nonHumanAp"},
	AIN_DAM_ADD                     : {label : "Extra AP Against Ahibs", apStat : "ahibAp"},
	KAMASILVIA_DAM_ADD              : {label : "Extra AP Against Kamasylvian", apStat : "kamaAp"},
	ALL_AP_UP                       : {label : "AP", apStat : "allAp"},

	ATT_UP                     : {label : "Attack Speed", stat : "attackSpeed"},
	CAS_UP                     : {label : "Casting Speed", stat : "castSpeed"},
	CRI_POINT                  : {label : "Critical Hit", stat : "crit"},
	CRI_ATT_DAM_ADD            : {label : "Critical Hit Extra Damage", unit : "%", stat : "critDamage"},
	ALL_HIT_UP                 : {label : "Accuracy", stat : "accuracy"},
	ACC_ADD                    : {label : "Accuracy", stat : "accuracy"},
	ALL_SPECIAL_ATT_DAM_ADD    : {label : "All Special Attack Damage", unit : "%", stat : "specialDamage"},

	ALL_EVA_UP         : {label : "Evasion", stat : "evasion"},
	ALL_DP_UP          : {label : "DP", stat : "dp"},
	ALL_DAM_REDUCE_ADD : {label : "Damage Reduction", stat : "damageReduction"},
	MON_DAM_REDUCE_ADD : {label : "Monster Damage Reduction", stat : "monsterDr"},

	HP_UP         : {label : "Max HP", stat : "hp"},
	HP_ADD        : {label : "Max HP", stat : "hp"},
	MP_WP_SP_UP   : {label : "Max MP/WP/SP", stat : "mp"},
	ENDURANCE_UP  : {label : "Max Stamina", stat : "stamina"},
	ENDURANCE_ADD : {label : "Max Stamina", stat : "stamina"},

	ALL_REG_ADD                     : {label : "All Resistance", unit : "%", stat : "allResist"},
	STUN_STIFFNESS_FREEZING_REG_ADD : {label : "Stun/Stiffness/Freezing Resistance", unit : "%", stat : "stunResist"},
	KNOCKDOWN_BOUND_REG_ADD         : {label : "Knockdown/Bound Resistance", unit : "%", stat : "kdResist"},
	KNOCKBACK_AIRBORNE_REG_ADD      : {label : "Knockback/Floating Resistance", unit : "%", stat : "kbResist"},

	MOVE_UP                    : {label : "Movement Speed", stat : "moveSpeed"},
	MOVE_ADD                   : {label : "Movement Speed", stat : "moveSpeed"},
	LUCK_POINT_UP              : {label : "Luck", stat : "luck"},
	COMBAT_EXP_ACQUISITION_ADD : {label : "Combat EXP", unit : "%", stat : "combatExp"},
	SKILL_EXP_ACQUISITION_ADD  : {label : "Skill EXP", unit : "%", stat : "skillExp"},
	DEATH_DISAD_DOWN           : {label : "Death Penalty Reduction", unit : "%", stat : "deathPenalty"},
	AFFINITY_ACQUISITION_ADD   : {label : "Amity Gain", unit : "%", stat : "amity"},
	COLLECT_TIME_DECRE         : {label : "Gathering Time Reduction", stat : "gatherTime"},
	JUMP_HEIGHT_ADD            : {label : "Jump Height"},

	// Haetae's blessing is the weight-limit effect (Basilisk's Belt +80 LT).
	HAETAE_BLESSING : {label : "Weight Limit", unit : "LT", stat : "weightLimit"},

	// Life mastery + life stats on tools/clothes (Loggia/Manos etc.).
	LIFESTAT_ALL                  : {label : "All Life Mastery", stat : "allMastery"},
	LIFESTAT_ALL_ADD              : {label : "All Life Mastery", stat : "allMastery"},
	LIFESTAT_ALCHEMY_ALL_ADD      : {label : "Alchemy Mastery", stat : "alchemyMastery"},
	LIFESTAT_ALCHEMYPOINT_ALL_ADD : {label : "Alchemy Mastery", stat : "alchemyMastery"},
	LIFESTAT_COOK_ALL_ADD         : {label : "Cooking Mastery", stat : "cookMastery"},
	LIFESTAT_COOK_ADD             : {label : "Cooking Mastery", stat : "cookMastery"},
	LIFESTAT_FISHING_ALL_ADD      : {label : "Fishing Mastery", stat : "fishMastery"},
	LIFESTAT_FISHINGPOINT_ALL_ADD : {label : "Fishing Mastery", stat : "fishMastery"},
	FISHING_POINT                 : {label : "Fishing Mastery", stat : "fishMastery"},
	LIFESTAT_HUNTING_ALL_ADD      : {label : "Hunting Mastery", stat : "huntMastery"},
	LIFESTAT_HUNTINGPOINT_ALL_ADD : {label : "Hunting Mastery", stat : "huntMastery"},
	LIFESTAT_VOYAGE_ALL_ADD       : {label : "Sailing Mastery", stat : "sailMastery"},
	LIFESTAT_VOYAGEPOINT_ALL_ADD  : {label : "Sailing Mastery", stat : "sailMastery"},
	LIFESTAT_TRAINING_ALL_ADD     : {label : "Training Mastery", stat : "trainMastery"},
	LIFESTAT_TRAININGPOINT_ALL_ADD : {label : "Training Mastery", stat : "trainMastery"},
	LIFESTAT_CRAFT                : {label : "Processing Mastery", stat : "processMastery"},
	LIFESTAT_CRAFT_ADD            : {label : "Processing Mastery", stat : "processMastery"},
	LIFESTAT_CRAFT_ALL_ADD        : {label : "Processing Mastery", stat : "processMastery"},
	LIFESTAT_COLLECT_ALL          : {label : "Gathering Mastery", stat : "gatherMastery"},
	LIFESTAT_COLLECT_ALL_ADD      : {label : "Gathering Mastery", stat : "gatherMastery"},
	COOK_REDUCE_TIME_DOWN         : {label : "Cooking Time", unit : "sec", stat : "cookTime", negate : true},
	ALCHEMY_REDUCE_TIME_DOWN      : {label : "Alchemy Time", unit : "sec", stat : "alchTime", negate : true},
	LIFE_EXP_POINT_ADD            : {label : "Life EXP", unit : "%", stat : "lifeExp"},
};

// LIFE_EXP_1..10 and the per-gathering/processing-type mastery funcs
// (LIFESTAT_COLLECT_HOE_ADD, LIFESTAT_CRAFT_HEAT_ADD, ...) follow fixed
// prefixes; fold them into their family stat instead of enumerating each.
export function effectFuncInfo(func: string): EffectFuncInfo | undefined {
	const direct = effectFuncs[func];
	if (direct) {
		return direct;
	}
	if (/^(PO_)?LIFE_EXP_\d+$/.test(func)) {
		return {label : "Life EXP", unit : "%", stat : "lifeExp"};
	}
	if (/^LIFESTAT_COLLECT_\w+$/.test(func)) {
		return {label : "Gathering Mastery", stat : "gatherMastery"};
	}
	if (/^LIFESTAT_CRAFT_\w+$/.test(func)) {
		return {label : "Processing Mastery", stat : "processMastery"};
	}
	return undefined;
}

// Gear whose stats come as StatMod buffs (item.effects.stats/hidden) rather
// than the enhancement DSL - alchemy stones, life tools/clothes. Keyed by the
// StatMod.stat display string.
export const statModStats: Record<string, { stat?: FlatStatKey, apStat?: ApStatKey }> = {
	"All AP"                        : {apStat : "allAp"},
	"Extra AP Against Monsters"     : {apStat : "monsterAp"},
	"All Accuracy"                  : {stat : "accuracy"},
	"Attack Speed"                  : {stat : "attackSpeed"},
	"Casting Speed"                 : {stat : "castSpeed"},
	"All Resistance"                : {stat : "allResist"},
	"All Damage Reduction"          : {stat : "damageReduction"},
	"All Evasion"                   : {stat : "evasion"},
	"Monster Damage Reduction Rate" : {stat : "monsterDrRate"},
	"Max HP"                        : {stat : "hp"},
	"Max Stamina"                   : {stat : "stamina"},
	"HP Recovery on Hit"            : {stat : "hpRecovOnHit"},
	"Movement Speed"                : {stat : "moveSpeed"},
	"Combat EXP"                    : {stat : "combatExp"},
	"Skill EXP"                     : {stat : "skillExp"},
	"Item Drop Rate"                : {stat : "itemDropRate"},
	"Weight Limit"                  : {stat : "weightLimit"},
	"Gathering Speed"               : {stat : "gatherSpeed"},
	"Fishing Speed"                 : {stat : "fishSpeed"},
	"Cooking Time"                  : {stat : "cookTime"},
	"Alchemy Time"                  : {stat : "alchTime"},
	"Processing Success Rate"       : {stat : "processSuccess"},
	"Gathering Item Drop Rate"      : {stat : "gatherDropRate"},
	"Life EXP"                      : {stat : "lifeExp"},
	"Life Skill Mastery"            : {stat : "allMastery"},
};

// Value-less named effects (the data carries no number for these).
export const effectNamedFuncs: Record<string, string> = {
	ALL_AP_INCRE             : "All AP Up",
	ALL_AP_INCRE_VALUE       : "All AP Up",
	ALL_HIT_INCRE            : "All Accuracy Up",
	ALL_DP_INCRE             : "All DP Up",
	ALL_EVA_INCRE            : "All Evasion Up",
	ALL_DAM_REDUCE_INCRE     : "All Damage Reduction Up",
	MONSTER_DAM_ADD_INCRE    : "Extra AP Against Monsters Up",
	MONSTER_DAM_ADD_INCRE_16 : "Extra AP Against Monsters Up",
	P_M_DAM_ADD_INCRE        : "Extra AP Against All Up",
	P_M_DAM_ADD_INCRE_6      : "Extra AP Against All Up",
	P_H_DAM_ADD_INCRE        : "Extra AP Against All Up",
	MON_DAM_REDUCE_INCRE     : "Monster Damage Reduction Up",
	MON_DAM_REDUCE_INCRE_16  : "Monster Damage Reduction Up",
	AIN_DAM_ADD_INCRE        : "Extra AP Against Ahibs Up",
	KU_ALL_REG_ADD           : "All Resistance Up",
	NU_ALL_REG_ADD           : "All Resistance Up",
};
