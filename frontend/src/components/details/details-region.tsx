import {useDetail} from "@/state/detail.tsx";
import {ChipList, DetailsHeader, DetailsNpcList, DetailsSection, DetailsShell} from "@/components/details/details-components.tsx";
import {DetailsJsonInspector} from "@/components/details/details-item.tsx";
import {isRegion} from "@/state/sources/sources.ts";

export function RegionDetails() {
	const [, d] = useDetail();

	if (!isRegion(d.entry)) {
		return null;
	}

	const e         = d.entry.value;
	const territory = d.regionExtra?.territory;
	const group     = d.regionExtra?.warehouseGroup ?? [];

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={e.name}
					urn={territory?.urn}
					lines={{
						"ID"        : d.entry.urn,
						"Territory" : () => territory?.name,
						"Nation"    : () => territory?.nation,
						"Capital"   : () => territory?.capitalName,
					}}
				/>
			)}
		>
			{group.length > 0 && (
				<DetailsSection title={"Warehouse Group"} borderTop>
					<ChipList items={group.map(name => ({name}))} />
				</DetailsSection>
			)}

			{d.regionExtra?.npcs?.length ? (
				<DetailsSection title={"NPCs"} borderTop>
					<DetailsNpcList npcUrns={d.regionExtra.npcs} />
				</DetailsSection>
			) : null}

			<DetailsJsonInspector data={{entry : e, extra : d.regionExtra}} />
		</DetailsShell>
	);
}
