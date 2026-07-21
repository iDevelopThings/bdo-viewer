import type {MaybeReadonly} from "@/types.ts";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {EffectSections} from "@/components/details/effects.tsx";
import {namedGroups} from "@/lib/stat-groups.ts";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {DetailsRecipes, DetailsUsedIn} from "@/components/details/recipes.tsx";
import {Chip, ChipList, DetailsHeader, DetailsSection, DetailsShell, EntityMapChip, SectionSubtitle, DetailsNodeList,} from "@/components/details/details-components.tsx";
import {useDetail, useDetailStore} from "@/state/detail.tsx";
import {JsonInspector} from "@rexxars/react-json-inspector";
import "@rexxars/react-json-inspector/json-inspector.css";
import {useSnapshot} from "valtio";
import {openMapAt, goToURN} from "@/state/panels.ts";
import type {ItemVendorData} from "@bindings/bdo-viewer/internal/catalog";

import {isItem} from "@/state/sources/sources.ts";
import {ItemTypeInfos} from "@/lib/types/item-types.gen.ts";

export function DetailsItem() {
	const {entry} = useSnapshot(useDetailStore());
	const item    = isItem(entry) ? entry.value : undefined;
	if (!item) {
		return null;
	}

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={item.name}
					urn={item.urn}
					grade={item.grade}
					lines={{
						"ID"            : item.urn,
						"Type"          : ItemTypeInfos[item.itemType].title,
						"Crystal Group" : () => {
							if (!item.crystalGroup) {
								return undefined;
							}
							const str = item.crystalGroup.name;
							if (item.crystalGroup.max < 1000) {
								return str + ` (max transfusable: ${item.crystalGroup.max})`;
							}
							return str;
						},
						"Equips to"     : () => item.equipInfo?.slots?.length ? item.equipInfo.slots.join(", ") : undefined,
					}}
				/>
			)}
		>
			<DetailsSection title={"Description"}>
				<GameText text={item.description} className={"text-sm"} />
			</DetailsSection>

			<DetailsStats />

			<DetailsEnhancements />
			<DetailsEffects />

			<DetailsAcquisition />
			<DetailsRecipes />
			<DetailsUsedIn />
			<DetailsKnowledge />

			<DetailsJsonInspector />
		</DetailsShell>
	);
}

export function DetailsEnhancements() {
	const {level, levelName, minLevel, maxLevel, maxCaphrasStep, caphrasStep, valid} = useSnapshot(useDetailStore());

	const store = useDetailStore();

	if (!valid)
		return null;

	return (
		<DetailsSection title={"Enhancements"} borderTop>

			<div className={"flex flex-col gap-6 max-w-4/6"}>
				<div className="flex items-center gap-6">
					<Label htmlFor="enhance-level">Enhance Level</Label>
					<span className="text-sm text-muted-foreground">
                        {levelName} ({level})
			        </span>
				</div>
				<Slider
					id="enhance-level"
					value={level}
					onValueChange={(value) => {
						store.setLevel(value as number);
					}}
					min={minLevel}
					max={maxLevel}
					step={1}
				/>

				{maxCaphrasStep > 0 && (
					<>
						<div className="flex items-center gap-6">
							<Label>Caphras Enhancement</Label>
							<span className="text-sm text-muted-foreground">{caphrasStep}</span>
						</div>
						<Slider
							value={caphrasStep}
							onValueChange={(value) => {
								store.setCaphrasStep(value as number);
							}}
							min={0}
							max={maxCaphrasStep}
							step={1}
						/>
					</>
				)}
			</div>

		</DetailsSection>
	);
}

export function DetailsEffects() {
	const [, d] = useDetail();

	const groups = namedGroups(d.stats);
	if (groups.length === 0) {
		return null;
	}

	return (
		<DetailsSection title={"Effects"} borderTop>
			<EffectSections groups={groups} />
		</DetailsSection>
	);
}


export function DetailsKnowledge() {
	const [, d] = useDetail();

	if (!d.knowledge || (!d.knowledge.entries?.length && !d.knowledge.themes?.length)) {
		return null;
	}

	return (
		<DetailsSection title={"Knowledge"} borderTop>
			<div className={"flex flex-col gap-4"}>

				{(d.knowledge.entries?.length ?? 0) > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Entries"} />
						<ChipList
							variant={"md"}
							onClick={(item, pinned) => {
								goToURN(item.urn, {
									title : item.name,
									pinned
								});
							}}
							items={d.knowledge.entries?.map((entry) => ({urn : entry.urn, name : entry.name}))}
						/>

					</div>
				)}

				{(d.knowledge.themes?.length ?? 0) > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Themes"} />
						<ChipList
							variant={"md"}
							onClick={(item, pinned) => {
								goToURN(item.urn, {
									title : item.name,
									pinned
								});
							}}
							items={d.knowledge.themes?.map((theme) => ({urn : theme.urn, name : theme.name}))}
						/>

					</div>
				)}
			</div>
		</DetailsSection>
	);
}

/** The distinct places a vendor stands in, across every placement of every NPC with their name. */
function vendorTowns(vendor: MaybeReadonly<ItemVendorData>): string[] {
	return [...new Set((vendor.spawns ?? []).map(s => s.regionName).filter(Boolean))] as string[];
}

export function DetailsAcquisition() {
	const [, d] = useDetail();

	if (d.vendors?.length === 0 && d.gatheredFrom.length === 0 && d.gatherNodes.length === 0) {
		return null;
	}

	return (
		<DetailsSection title={"Acquisition"} borderTop>
			<div className={"flex flex-col gap-4"}>
				{(d.vendors?.length ?? 0) > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Sold By"} />
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{d.vendors?.map((vendor, i) => {
								const towns    = vendorTowns(vendor);
								const npcURN   = vendor.urns?.[0];
								const hasSpawn = (vendor.spawns?.length ?? 0) > 0;
								const locLabel = towns.length === 1 ? towns[0]
									: towns.length > 1 ? `${towns.length} towns`
										: undefined;
								return (
									<EntityMapChip
										key={`vendor-${vendor.name}-${i}`}
										name={vendor.name}
										subtitle={vendor.title}
										location={locLabel}
										onOpen={npcURN
											? (pinned) => goToURN(npcURN, {title : vendor.name, pinned})
											: hasSpawn
												? () => openMapAt(vendor.spawns![0].pos)
												: undefined}
										onMap={hasSpawn ? () => openMapAt(vendor.spawns![0].pos) : undefined}
									/>
								);
							})}
						</div>
					</div>
				)}
				{d.gatheredFrom.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Gathered From"} />
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{d.gatheredFrom.map((source) => (
								<Chip
									key={`gathered-${source}`}
									label={source}
									variant={"sm"}
									onClick={() => {
									}}
								/>
							))}
						</div>
					</div>
				)}
				{d.gatherNodes.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Gather Nodes"} />
						<DetailsNodeList nodeUrns={d.gatherNodes} />
					</div>
				)}
			</div>
		</DetailsSection>
	);
}

export function DetailsJsonInspector({data}: { data?: unknown } = {}) {
	const [, d] = useDetail();

	return (
		<DetailsSection title={"Raw Data"} borderTop>
			<JsonInspector data={data ?? d.entry?.value} />
		</DetailsSection>
	);
}
