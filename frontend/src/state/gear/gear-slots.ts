import {GEAR_SLOTS, type GearGroupId, type GearSlotDef} from "@/state/gear/gear-slots.gen.ts";

export * from "@/state/gear/gear-slots.gen.ts";

export const GEAR_SLOTS_BY_ID: Record<string, GearSlotDef> = Object.fromEntries(
	GEAR_SLOTS.map(s => [s.id, s])
);

export function slotsForGroup(group: GearGroupId): GearSlotDef[] {
	return GEAR_SLOTS.filter(s => s.group === group);
}
