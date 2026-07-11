import {IDockviewPanelProps} from "dockview-react";
import {useDetail} from "@/state/detail.tsx";
import {DetailsHeader, DetailsNpcList, DetailsSection} from "@/components/details/details-components.tsx";
import {isCharacter} from "@/state/sources/sources.ts";

// CharacterDetails renders a knowledge subject (loc-6 entity): its name + kind,
// and — for subjects that are real NPCs — the linked NPC records (each opens the
// NPC detail with its spawn/map location). Non-NPC kinds (monster/object/…) are
// terminal: just a name + kind badge.
export function CharacterDetails(props: IDockviewPanelProps) {
	const [, d] = useDetail();

	if (!isCharacter(d.entry)) {
		return null;
	}

	const c = d.entry.value;

	return (
		<div className="flex flex-col grow">
			<DetailsHeader
				title={c.name ?? ""}
				lines={{Kind : c.kind ?? "—"}}
			/>
			<div className={"gap-8 pb-8"}>
				{c.npcs?.urns?.length ? (
					<DetailsSection title={"NPCs"} borderTop>
						<DetailsNpcList npcUrns={c.npcs.urns} />
					</DetailsSection>
				) : null}
			</div>
		</div>
	);
}
