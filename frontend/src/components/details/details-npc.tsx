import {useDetail} from "@/state/detail.tsx";
import {DetailsHeader, DetailsSection, DetailsShell, EntityMapChip} from "@/components/details/details-components.tsx";
import {DetailsKnowledge} from "@/components/details/details-item.tsx";
import {goToURN, openMapAt} from "@/state/panels.ts";
import {isNpc} from "@/state/sources/sources.ts";

export function NpcDetails() {
	const [, d] = useDetail();

	if (!isNpc(d.entry)) {
		return null;
	}

	const e = d.entry.value;
	const spawns = (e.spawns ?? []).filter(s => s.region || s.pos.length >= 3);

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={e.name}
					urn={d.entry.urn}
					lines={{
						"ID"    : d.entry.urn,
						"Title" : () => e.title || undefined,
					}}
				/>
			)}
		>
			{spawns.length > 0 && (
				<DetailsSection title={"Location"} borderTop>
					<div className="flex flex-row items-center flex-wrap gap-2">
						{spawns.map((s, i) => {
							const regionURN  = s.region;
							const regionName = s.regionName || "Location";
							const hasPos     = s.pos.length >= 3;
							return (
								<EntityMapChip
									key={`spawn-${regionURN ?? i}-${i}`}
									name={regionName}
									onOpen={regionURN
										? (pinned) => goToURN(regionURN, {title : regionName, pinned})
										: undefined}
									onMap={hasPos ? () => openMapAt(s.pos) : undefined}
								/>
							);
						})}
					</div>
				</DetailsSection>
			)}

			<DetailsKnowledge />
		</DetailsShell>
	);
}
