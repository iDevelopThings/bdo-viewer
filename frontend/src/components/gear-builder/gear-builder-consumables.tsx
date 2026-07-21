import {FlaskConical} from "lucide-react";
import {AddConsumable, RemoveConsumable} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useSnapshot} from "valtio/react";
import {ComboboxTriggerNoChevron} from "@/components/ui/combobox.tsx";
import {ItemSlotButton} from "@/components/gear-builder/gear-slot-button.tsx";
import {consumableFamily} from "@/state/sources/items.ts";
import {EntryListComboPicker} from "@/components/entry-list/entry-list-combo-picker.tsx";
import {EntryFilterProvider} from "@/components/entry-list/filters/entry-filter-provider.tsx";

const CONSUMABLE_PICKER_PARAMS = {
	source   : SourceKind.Item,
	sort     : "consumable",
	sort_dir : "asc",
	filters  : {
		consumable : true,
	},
};

export function ConsumablesRow() {
	const {consumables} = useSnapshot(gearBuilderStore);

	return (

		<div className={"flex flex-col gap-2 items-center"}>
			{consumables.map(item => {
				if (!item) {
					return null;
				}
				return <ItemSlotButton
					key={item.urn}
					item={{
						title : item.name ?? "",
						urn   : item.urn,
						icon  : item.icon,
						extra : {
							grade : item.grade
						}
					}}
					size={"lg"}
					slotTitle={item.name}
					enhanceTitle={consumableFamily(item)}
					onRemove={() => RemoveConsumable(item.urn)}
				/>;
			})}

			<EntryFilterProvider params={CONSUMABLE_PICKER_PARAMS}>
				<EntryListComboPicker
					onSelect={e => e ? void AddConsumable(e.urn) : undefined}
					trigger={
						<ComboboxTriggerNoChevron
							nativeButton={false}
							render={
								<ItemSlotButton
									size={"xl"}
									slotTitle={"Add Consumable"}
									placeholder={<FlaskConical className={"size-3.5"} />}
								/>
							}
						/>
					}
					placeholder={"Search consumables…"}
					positioning={{
						align : "end",
						side  : "top",
					}}
				/>
			</EntryFilterProvider>
		</div>
	);
}



