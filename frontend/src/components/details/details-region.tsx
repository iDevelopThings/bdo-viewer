import {useDetail} from "@/state/detail.tsx";
import {DetailsHeader, DetailsNpcList, DetailsSection} from "@/components/details/details-components.tsx";
import {getEntryKey} from "@/state/detail-store.tsx";
import {isRegion} from "@/state/sources/sources.ts";
import {NpcURN} from "@/lib/urn.ts";

export function RegionDetails() {
	const [, d] = useDetail();

	if (!isRegion(d.entry)) {
		return null;
	}

	const e = d.entry.value;


	return (
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={e.name}
				icon={d.regionExtra?.territory?.iconLarge}
				lines={{
					"ID"     : getEntryKey(d.entry).toString(),
					"Nation" : d.regionExtra?.territory?.nation
				}}
			/>
			<div className={"gap-8 pb-8"}>
				<DetailsSection title={"Json"} expandable={false} borderTop>
					<code><pre>{JSON.stringify({
						entry : e,
						extra : d.regionExtra,
					}, null, 2)}</pre>
					</code>
				</DetailsSection>


				{d.regionExtra?.npcs?.length && (
					<DetailsSection title={"NPCS"} borderTop>
						<DetailsNpcList npcUrns={(d.regionExtra?.npcs ?? []).map(id => NpcURN.new(id))} />
					</DetailsSection>
				)}

			</div>

		</div>
	);
}

