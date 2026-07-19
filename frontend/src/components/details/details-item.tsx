import type {MaybeReadonly} from "@/types.ts";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {EffectSections} from "@/components/details/effects.tsx";
import {namedGroups} from "@/lib/stat-groups.ts";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {DetailsRecipes, DetailsUsedIn} from "@/components/details/recipes.tsx";
import {Chip, ChipList, DetailsHeader, DetailsSection, SectionSubtitle} from "@/components/details/details-components.tsx";
import {useDetail, useDetailStore} from "@/state/detail.tsx";
import {JsonInspector} from "@rexxars/react-json-inspector";
import "@rexxars/react-json-inspector/json-inspector.css";
import {useEffect, useMemo} from "react";
import {useSnapshot} from "valtio";
import {MapPinIcon} from "lucide-react";
import {mapState} from "@/components/world-map/map-state.ts";
import {openMapAt, openMapAtNode, goToURN} from "@/state/panels.ts";
import {ItemVendorData} from "@bindings/bdo-viewer/internal/catalog";

import {isItem} from "@/state/sources/sources.ts";
import {ItemTypeInfos} from "@/lib/types/item-types.gen.ts";

export function DetailsItem() {
	const {entry} = useSnapshot(useDetailStore());
	const item    = isItem(entry) ? entry.value : undefined;
	if (!item) {
		return null;
	}

	return (
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={item.name}
				icon={item.icon}
				grade={item.grade}
				lines={{
					"ID"              : item.id.toString(),
					"Type"            : ItemTypeInfos[item.itemType]?.title,
					"Crystal Group: " : () => {
						if (!item.crystalGroup) {
							return undefined;
						}
						const str = item.crystalGroup.name;
						if (item.crystalGroup.max < 1000) {
							return str + ` (max transfusable: ${item.crystalGroup.max})`;
						}
						return str;
					},
					"Equips to: "     : () => item.equipInfo?.slots?.length > 0 ? item.equipInfo.slots.join(", ") : undefined,
				}}
			/>
			<div className={"gap-8 pb-8"}>
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
			</div>

		</div>
	);
}

export function DetailsEnhancements() {
	const {level, levelName, minLevel, maxLevel, maxCaphrasStep, caphrasStep, valid} = useSnapshot(useDetailStore());

	const store = useDetailStore();

	// const [details, d] = useDetail();

	if (!valid)
		return null;

	return (
		<DetailsSection title={"Enhancements"} borderTop>

			<div className={"flex flex-col gap-6 max-w-4/6"}>
				<div className="flex items-center gap-6">
					<Label htmlFor="slider-demo-temperature">Enhance Level</Label>
					<span className="text-sm text-muted-foreground">
                        {levelName} ({level})
			        </span>
				</div>
				<Slider
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

				{d.knowledge.entries?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Categories"} />
						<ChipList
							variant={"md"}
							onClick={(item, pinned) => {
								goToURN(item.id.toString(), {
									title : item.name,
									pinned
								});
							}}
							items={d.knowledge.entries.map((entry) => ({id : entry.urn, name : entry.name}))}
						/>

					</div>
				)}

				{d.knowledge.themes?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Themes"} />
						<ChipList
							variant={"md"}
							onClick={(item, pinned) => {
								goToURN(item.id.toString(), {
									title : item.name,
									pinned
								});
							}}
							items={d.knowledge.themes.map((theme) => ({id : theme.urn, name : theme.name}))}
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
	const [, d]   = useDetail();
	const {graph} = useSnapshot(mapState);

	// The gather-node chips name their nodes from the map graph, which the user may never have
	// opened the map to load.
	useEffect(() => {
		if (d.gatherNodes.length) {
			void mapState.ensureLoaded();
		}
	}, [d.gatherNodes.length]);

	const gatherNodes = useMemo(
		() => d.gatherNodes.map(urn => ({urn, node: graph.node(urn)})),
		[d.gatherNodes, graph],
	);

	if (d.vendors?.length === 0 && d.gatheredFrom.length === 0 && d.gatherNodes.length === 0) {
		return null;
	}

	return (
		<DetailsSection title={"Acquisition"} borderTop>
			<div className={"flex flex-col gap-4"}>
				{d.vendors?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<p className="text-sm text-fg-subtle font-semibold mb-2 uppercase">Sold By</p>
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{d.vendors.map((vendor, i) => {
								const towns = vendorTowns(vendor);
								return (
									<Chip
										key={`vendor-${vendor.name}-${i}`}
										label={(
											<span className={"flex flex-row items-center gap-1.5"}>
												{vendor.name}
												{vendor.title && <span className={"text-fg-subtle"}>{vendor.title}</span>}
												{towns.length > 0 && (
													<span className={"text-fg-subtle"}>{towns.join(", ")}</span>
												)}
												{vendor.spawns?.length > 0 && <MapPinIcon size={11} className={"text-fg-subtle"} />}
											</span>
										)}
										variant={"sm"}
										// A vendor the client's NPC table has no record of has no spawn to fly to
										// (Item.UnresolvedVendors); the rest go to their first placement.
										onClick={vendor.spawns?.length ? () => openMapAt(vendor.spawns![0].pos) : undefined}
									/>
								);
							})}
						</div>
					</div>
				)}
				{d.gatheredFrom.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<p className="text-sm text-fg-subtle font-semibold mb-2 uppercase">Gathered From</p>
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
						<p className="text-sm text-fg-subtle font-semibold mb-2 uppercase">Gather Nodes</p>
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{gatherNodes.map(({urn, node}) => {
								return (
									<Chip
										key={`gather-node-${urn}`}
										label={(
											<span className={"flex flex-row items-center gap-1.5"}>
												{node ? `${node.parent()?.name ?? node.name}` : urn}
												{node && <span className={"text-fg-subtle"}>{node.name}</span>}
												<MapPinIcon size={11} className={"text-fg-subtle"} />
											</span>
										)}
										variant={"sm"}
										onClick={() => openMapAtNode(urn)}
									/>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</DetailsSection>
	);
}

export function DetailsJsonInspector() {
	const [, d] = useDetail();

	return (
		<DetailsSection title={"Raw Data"} borderTop>
			<JsonInspector data={d.entry.value} />
		</DetailsSection>
	);
}
