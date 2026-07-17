import {EntryPicker} from "@/components/entry-list/entry-picker.tsx";
import {useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";

// ItemPicker is the gear-builder's slot picker: a thin wrapper over the generic
// EntryPicker that scopes results to the slot's equip slots + the build's class.
export function ItemPicker() {
	const [builder, s] = useGearBuilderStore();

	const slot = builder.pickerSlot;
	if(!slot) {
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
				class      : builder.selectedClass.Name,
			}}
			onPick={entry => {
				void s.equip(slot.id, entry.urn);
				s.closePicker();
			}}
			onClose={() => s.closePicker()}
		/>
	);
}
