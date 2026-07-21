import {NPCSpawnType} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import type {MaybeReadonly} from "@/types.ts";

// Only where the enum name isn't the game's word for it, or reads badly split up.
const ROLE_LABEL_OVERRIDES: Partial<Record<NPCSpawnType, string>> = {
	[NPCSpawnType.NPCSpawnTypeNormal]                 : "No role",
	[NPCSpawnType.NPCSpawnTypeExplorer]               : "Node manager",
	[NPCSpawnType.NPCSpawnTypeImportantNPC]           : "Important NPC",
	[NPCSpawnType.NPCSpawnTypeIntimacy]               : "Amity",
	[NPCSpawnType.NPCSpawnTypeMating]                 : "Breeding",
	[NPCSpawnType.NPCSpawnTypeItemMarket]             : "Central Market",
	[NPCSpawnType.NPCSpawnTypeItemRepairer]           : "Repairs",
	[NPCSpawnType.NPCSpawnTypeCollect]                : "Gathering supplies",
	[NPCSpawnType.NPCSpawnTypeJewel]                  : "Crystals & jewelry",
	[NPCSpawnType.NPCSpawnTypeWorker]                 : "Work supervisor",
	[NPCSpawnType.NPCSpawnTypePC]                     : "PC room",
	[NPCSpawnType.NPCSpawnTypePCRoomStable]           : "PC room stable",
	[NPCSpawnType.NPCSpawnTypeAbyssOneEnterPositionGuide] : "Abyss One guide",
	[NPCSpawnType.NPCSpawnTypeChangeMarniStone]       : "Marni stone",
};

/** "NPCSpawnTypeGuildSupplyShop" -> "Guild supply shop". Derived rather than hand-listed, so a
 *  client patch adding a role still labels itself. */
function humanize(name: string): string {
	const words = name.replace(/^NPCSpawnType/, "").replace(/([a-z])([A-Z])/g, "$1 $2");

	return words.charAt(0) + words.slice(1).toLowerCase();
}

export function npcRoleLabel(type: NPCSpawnType): string {
	return ROLE_LABEL_OVERRIDES[type] ?? humanize(NPCSpawnType[type]);
}

/** Every role the enum defines, deduped (Normal and the generated $zero share 0). */
export const NPC_ROLES: NPCSpawnType[] = [
	...new Set(Object.values(NPCSpawnType).filter((v): v is NPCSpawnType => typeof v === "number")),
].sort((a, b) => a - b);

export function npcRoleLabels(types: MaybeReadonly<NPCSpawnType[]> | undefined | null): string[] {
	return [...(types ?? [])].map(npcRoleLabel);
}
