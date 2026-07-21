import {Button} from "@/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover";
import {useSnapshot} from "valtio/react";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {Backpack} from "lucide-react";
import {ItemSlotButton} from "@/components/gear-builder/gear-slot-button.tsx";
import type {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";

export function GearHistory() {
	const {gearHistory} = useSnapshot(gearBuilderStore);

	return (
		<Popover>
			<PopoverTrigger render={
				<Button variant="slot" size="slot" aria-label="Gear history">
					<Backpack className="h-6 w-6 " />
				</Button>
			} />
			<PopoverContent align={"end"} side={"top"} className="grow w-auto gap-0 min-w-20 max-h-48 overflow-y-auto p-0">

				<p className={"px-2 py-1 text-xs font-medium text-fg-subtle bg-surface-1 border-b border-surface-border"}>
					Equip History
				</p>

				<div className="grid grid-cols-4 gap-1 p-1">
					{gearHistory.map((entry, index) => (
						<ItemSlotButton
							key={index}
							item={entry}
							size={"sm"}
							onClick={() => {
								const slot = entry.extra?.slot as SlotName | undefined;
								if (slot == null) {
									return;
								}
								void gearBuilderStore.equip(entry.urn, slot);
							}}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
