import {useDetailStore} from "@/state/detail.tsx";
import {ChipList, DetailsHeader, DetailsItemList, DetailsSection, DetailsShell, MapChip} from "@/components/details/details-components.tsx";
import {numberFormat, parseARGB} from "@/utils.tsx";
import {openMapAt, openMapAtNode, goToURN} from "@/state/panels.ts";
import {useSnapshot} from "valtio/react";
import {isGrindSpot} from "@/state/sources/sources.ts";
import {GameText, plainGameText} from "@/lib/game-text.tsx";

export function GrindSpotDetails() {
	const {entry} = useSnapshot(useDetailStore());

	if (!isGrindSpot(entry)) {
		return null;
	}

	const e = entry.value;

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={e.name}
					urn={entry.urn}
					lines={{
						"ID"           : e.urn.toString(),
						"Zone"         : () => e.mainCategory?.name,
						"Subs"         : () => e.subCategories?.map(s => s.name).join(", "),
						"AP"           : () => `${numberFormat.format(e.sheetAP ?? 0)} -> ${numberFormat.format(e.totalAP ?? 0)}`,
						"DP"           : () => `${numberFormat.format(e.sheetDP ?? 0)} -> ${numberFormat.format(e.totalDP ?? 0)}`,
						"Effective AP" : () => numberFormat.format(e.effectiveLimit ?? 0)
					}}
				/>
			)}
		>
			{(e.node?.urn || e.node?.pos?.length) && (
				<DetailsSection title={"Location"} borderTop>
					<div className="flex flex-row items-center flex-wrap gap-2">
						<MapChip
							label={e.node.name ?? e.name}
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
						{e.tags.map(t => (
							<div
								key={t.key}
								className={"text-sm text-fg-subtle px-2 py-1 rounded-md"}
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

			<ChipList
				section={"Ecology"}
				items={e.ecology}
				onClick={(item, pinned) => goToURN(item.urn, {title : item.name, pinned})}
			/>
			<ChipList
				section={"Topography"}
				items={e.topography}
				onClick={(item, pinned) => goToURN(item.urn, {title : item.name, pinned})}
			/>
			{/* Quest refs have no URN — display only. */}
			<ChipList section={"Recurring Quests"} items={e.recurringQuests} />
			<ChipList section={"Region Quests"} items={e.regionQuests} />

			{e.loot && <DetailsSection title={"Loot"} borderTop>
				<DetailsItemList itemUrns={e.loot.urns} />
			</DetailsSection>}

			{e.titles?.length && (
				<DetailsSection title={"Titles"} borderTop>
					<div className={"grid grid-cols-3 gap-2"}>
						{e.titles.map(t => (
							/* Should be displayed as a card, rather than chip, with title and desc on separate lines */
							<div key={t.id} className={"flex flex-col gap-1 p-2 border rounded-md"}>
								<div className={"text-sm font-semibold"}>{t.name}</div>
								<GameText text={plainGameText(t.desc).replace("Title Requirement: ", "")} className={"text-xs text-fg-subtle"} />
							</div>
						))}
					</div>
				</DetailsSection>
			)}
		</DetailsShell>
	);
}
