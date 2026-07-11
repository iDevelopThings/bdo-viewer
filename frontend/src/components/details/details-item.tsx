import {IDockviewPanelProps} from "dockview-react";
import {type Grade} from "@/types.ts";
import {Label} from "@/components/ui/label.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {EffectSections} from "@/components/details/effects.tsx";
import {namedGroups} from "@/lib/stat-groups.ts";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {DetailsRecipes, DetailsUsedIn} from "@/components/details/recipes.tsx";
import {Chip, ChipList, DetailsHeader, DetailsSection, SectionSubtitle} from "@/components/details/details-components.tsx";
import {useDetail, useDetailItem} from "@/state/detail.tsx";
import {JsonInspector} from "@rexxars/react-json-inspector";
import "@rexxars/react-json-inspector/json-inspector.css";

export function DetailsItem(props: IDockviewPanelProps) {
	const [details, d] = useDetail();
	const item         = useDetailItem();

	return (
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={item.name}
				icon={item.icon}
				grade={item.grade as Grade}
				lines={{
					"ID"              : item.id.toString(),
					"Type"            : item.itemType,
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
	const [details, d] = useDetail();

	if (!d.valid)
		return null;

	return (
		<DetailsSection title={"Enhancements"} borderTop>

			<div className={"flex flex-col gap-6 max-w-4/6"}>
				<div className="flex items-center gap-6">
					<Label htmlFor="slider-demo-temperature">Enhance Level</Label>
					<span className="text-sm text-muted-foreground">
                        {d.levelName} ({d.level})
			        </span>
				</div>
				<Slider
					value={d.level}
					onValueChange={(value) => {
						details.level = value as number;
					}}
					min={d.minLevel}
					max={d.maxLevel}
					step={1}
				/>
			</div>

		</DetailsSection>
	);
}

export function DetailsEffects() {
	const [details, d] = useDetail();

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
	const [details, d] = useDetail();

	if (!d.knowledge || (!d.knowledge.entries?.length && !d.knowledge.themes?.length)) {
		return null;
	}

	return (
		<DetailsSection title={"Knowledge"} borderTop>
			<div className={"flex flex-col gap-4"}>

				{d.knowledge.entries?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Categories"}/>
						<ChipList
							variant={"md"}
							items={d.knowledge.entries.map((entry) => ({id : entry.key, name : entry.name}))}
						/>

					</div>
				)}

				{d.knowledge.themes?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<SectionSubtitle title={"Themes"}/>
						<ChipList
							variant={"md"}
							items={d.knowledge.themes.map((theme) => ({id : theme.key, name : theme.name}))}
						/>

					</div>
				)}
			</div>
		</DetailsSection>
	);
}

export function DetailsAcquisition() {
	const [details, d] = useDetail();

	if (d.vendors?.length === 0 && d.gatheredFrom.length === 0 && d.gatherNodes.length === 0) {
		return null;
	}

	return (
		<DetailsSection title={"Acquisition"} borderTop>
			<div className={"flex flex-col gap-4"}>
				{d.vendors?.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<p className="text-sm text-zinc-400 font-semibold mb-2 uppercase">Sold By</p>
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{d.vendors.map((vendor, i) => (
								<Chip
									key={`vendor-${vendor.name}-${i}`}
									label={vendor.name}
									variant={"sm"}
									onClick={() => {
									}}
								/>
							))}
						</div>
					</div>
				)}
				{d.gatheredFrom.length > 0 && (
					<div className={"flex flex-col gap-2"}>
						<p className="text-sm text-zinc-400 font-semibold mb-2 uppercase">Gathered From</p>
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
						<p className="text-sm text-zinc-400 font-semibold mb-2 uppercase">Gather Nodes</p>
						<div className={"flex flex-row gap-2 flex-wrap"}>
							{d.gatherNodes.map((node) => (
								<Chip
									key={`gather-node-${node}`}
									label={node}
									variant={"sm"}
									onClick={() => {
									}}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</DetailsSection>
	);
}

export function DetailsJsonInspector() {
	const [details, d] = useDetail();

	return (
		<DetailsSection title={"Raw Data"} borderTop>
			<JsonInspector data={d.entry.value} />
		</DetailsSection>
	);
}
