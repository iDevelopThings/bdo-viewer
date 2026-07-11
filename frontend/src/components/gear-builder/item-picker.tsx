import {GEAR_SLOTS_BY_ID} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {EntryPicker} from "@/components/entry-list/entry-picker.tsx";

// ItemPicker is the gear-builder's slot picker: a thin wrapper over the generic
// EntryPicker that scopes results to the slot's equip slots + the build's class.
export function ItemPicker() {
	const [store, snap] = useGearBuild();

	const slotId = snap.pickerSlot;
	if (!slotId) {
		return null;
	}

	const def = GEAR_SLOTS_BY_ID[slotId];
	if (!def) {
		return null;
	}

	return (
		<EntryPicker
			key={slotId}
			title={`Choose ${def.label}`}
			fields={["grade", "itemType", "equipType", "effect"]}
			baseFilters={{
				equipSlots : def.equipSlots,
				class      : snap.characterClass ?? "",
			}}
			onPick={entry => {
				void store.equip(slotId, entry.id);
				store.closePicker();
			}}
			onClose={() => store.closePicker()}
		/>
	);
}
