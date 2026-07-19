import {EntryPicker} from "@/components/entry-list/entry-picker.tsx";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useSnapshot} from "valtio/react";

// ItemPicker is the gear-builder's slot picker: a thin wrapper over the generic
// EntryPicker that scopes results to the slot's equip slots + the build's class.
export function ItemPicker() {
	const {pickerSlot : slot, selectedClass} = useSnapshot(gearBuilderStore);

	if (!slot) {
		return null;
	}

	return (
		<EntryPicker
			key={slot.id}
			title={`Choose ${slot.info.Title}`}
			fields={["grade", /* "equipType", */ "effect"]}
			defaultSort={"grade"}
			defaultSortDir={"desc"}
			defaultFocus={true}
			baseFilters={{
				equipSlots : [slot.info.SlotName],
				class      : selectedClass.Name,
			}}
			onPick={entry => {
				void gearBuilderStore.equip(entry.urn);
				gearBuilderStore.closePicker();
			}}
			onClose={() => gearBuilderStore.closePicker()}
		/>
	);
}
