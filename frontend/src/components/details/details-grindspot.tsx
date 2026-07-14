import {IDockviewPanelProps} from "dockview-react";
import {useDetail, useDetailItem} from "@/state/detail.tsx";
import {Chip, ChipList, DetailsHeader, DetailsItemList, DetailsSection} from "@/components/details/details-components.tsx";
import type {Grade} from "@/types.ts";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {DetailsRecipes, DetailsUsedIn} from "@/components/details/recipes.tsx";
import {DetailsAcquisition, DetailsEffects, DetailsEnhancements, DetailsJsonInspector, DetailsKnowledge} from "@/components/details/details-item.tsx";
import {isGrindSpot} from "@/state/sources/grindspot-source.tsx";
import {numberFormat, parseARGB} from "@/utils.tsx";
import {QuestRef, Ref} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {MapPinIcon} from "lucide-react";
import {openMapAt, openMapAtNode} from "@/state/panels.ts";

export function GrindSpotDetails(props: IDockviewPanelProps) {
	const [details, d] = useDetail();

	if (!isGrindSpot(d.entry)) {
		return null;
	}

	const e = d.entry.value;


	return (
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={e.name}
				// icon={e.icon}
				// grade={e.grade as Grade}
				lines={{
					"ID"           : e.key.toString(),
					"Zone"         : () => e.mainCategory?.name,
					"Subs"         : () => e.subCategories?.map(s => s.name)?.join(", "),
					"AP"           : () => `${numberFormat.format(e.sheetAP)} -> ${numberFormat.format(e.totalAP)}`,
					"DP"           : () => `${numberFormat.format(e.sheetDP)} -> ${numberFormat.format(e.totalDP)}`,
					"Effective AP" : () => numberFormat.format(e.effectiveLimit)
				}}
			/>
			<div className={"gap-8 pb-8"}>

				{(e.node?.urn || e.node?.pos?.length) && (
					<DetailsSection title={"Location"} borderTop>
						<div className="flex flex-row items-center flex-wrap gap-2">
							<Chip
								label={(
									<span className={"flex flex-row items-center gap-1.5"}>
										{e.node.name ?? e.name}
										<MapPinIcon size={11} className={"text-zinc-400"} />
									</span>
								)}
								variant={"sm"}
								// 6 of the 105 zones point at a key with no worldmap node — fall back to the raw
								// nav position so those still open the map somewhere useful.
								onClick={() => (e.node!.urn ? openMapAtNode(e.node!.urn) : openMapAt(e.node!.pos!))}
							/>
						</div>
					</DetailsSection>
				)}

				{e.tags?.length && (
					<DetailsSection title={"Tags"} borderTop>
						<div className="flex flex-row items-center flex-wrap gap-2">
							{e.tags?.map(t => (
								<div
									key={t.key}
									className={"text-sm text-zinc-400 px-2 py-1 rounded-md"}
									style={{
										backgroundColor : parseARGB(t.color, 0.3),
										color           : parseARGB(t.fontColor)
									}}
								>
									{t.name}
								</div>
							))}
						</div>
					</DetailsSection>
				)}

				<ChipList section={"Ecology"} items={e.ecology} />
				<ChipList section={"Topography"} items={e.topography} />
				<ChipList section={"Recurring Quests"} items={e.recurringQuests} />
				<ChipList section={"Region Quests"} items={e.regionQuests} />

				<DetailsSection title={"Loot"} borderTop>
					<DetailsItemList itemUrns={e.loot.urns} />
				</DetailsSection>

				{e.titles?.length && (
					<DetailsSection title={"Titles"} borderTop>
						<div className={"grid grid-cols-3 gap-2"}>
							{e.titles?.map(t => (
								/* Should be displayed as a card, rather than chip, with title and desc on separate lines */
								<div key={t.id} className={"flex flex-col gap-1 p-2 border rounded-md"}>
									<div className={"text-sm font-semibold"}>{t.name}</div>
									<div className={"text-xs text-zinc-400"}>{t.desc?.replace("Title Requirement: ", "")}</div>
								</div>
							))}
						</div>
					</DetailsSection>
				)}

			</div>

		</div>
	);
}

