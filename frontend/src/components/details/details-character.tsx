import {useDetailStore} from "@/state/detail.tsx";
import {DetailsHeader, DetailsNpcList, DetailsSection, DetailsShell} from "@/components/details/details-components.tsx";
import {isCharacter} from "@/state/sources/sources.ts";
import {useSnapshot} from "valtio/react";

// CharacterDetails renders a knowledge subject (loc-6 entity): its name + kind,
// and — for subjects that are real NPCs — the linked NPC records (each opens the
// NPC detail with its spawn/map location). Non-NPC kinds (monster/object/…) are
// terminal: just a name + kind badge.
export function CharacterDetails() {
	const {entry} = useSnapshot(useDetailStore())

	if (!isCharacter(entry)) {
		return null;
	}

	const c = entry.value;

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={c.name ?? ""}
					urn={entry.urn}
					lines={{
						"ID"   : entry.urn,
						"Kind" : c.kind ?? "—",
					}}
				/>
			)}
		>
			{c.npcs?.urns?.length ? (
				<DetailsSection title={"NPCs"} borderTop>
					<DetailsNpcList npcUrns={c.npcs.urns} />
				</DetailsSection>
			) : null}
		</DetailsShell>
	);
}
