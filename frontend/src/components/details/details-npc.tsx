import {IDockviewPanelProps} from "dockview-react";
import {useDetail} from "@/state/detail.tsx";
import {ChipList, DetailsHeader} from "@/components/details/details-components.tsx";
import {isNpc} from "@/state/sources/npc-source.tsx";
import {getEntryKey} from "@/state/detail-store.tsx";
import {DetailsKnowledge} from "@/components/details/details-item.tsx";
import {WorldURN} from "@/lib/urn.ts";
import {goToURN} from "@/state/panels.ts";

export function NpcDetails(props: IDockviewPanelProps) {
	const [details, d] = useDetail();

	if (!isNpc(d.entry)) {
		return null;
	}

	const e = d.entry.value;


	return (
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={e.name}
				lines={{
					"ID" : getEntryKey(d.entry).toString(),
				}}
			/>
			<div className={"gap-8 pb-8"}>

				<ChipList
					section={"Location"}
					items={e.spawns?.map(s => ({id : s.region, name : s.regionName}))}
					onClick={(s, pinned) => {
						goToURN(WorldURN.new("region", s.id), {title : s.name, pinned});
					}}
				/>

				<DetailsKnowledge />

			</div>

		</div>
	);
}

