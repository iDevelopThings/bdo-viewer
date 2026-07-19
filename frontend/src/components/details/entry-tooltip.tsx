import {type PropsWithChildren, useState} from "react";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {Item as ItemModel} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GameText} from "@/lib/game-text.tsx";
import {cn} from "@/lib/utils.ts";
import {findSourceByURN} from "@/state/sources/sources.ts";
import {EffectSections} from "@/components/details/effects.tsx";
import {flatStats, namedGroups} from "@/lib/stat-groups.ts";
import {Tooltip as TooltipPrimitive} from "@base-ui/react/tooltip";
import {GetEntryDetailsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {EntryDetailsData} from "@/state/detail-store.tsx";
import {getGradeColor, ItemGrades, ItemGrade} from "@/lib/types/item-grades.ts";

// Drop-in tooltip for any entry, given its URN: <EntryTooltip urn={"urn::item:123"}>…</EntryTooltip>.
// Data loads lazily on first hover (and is cached after that), so wrapping
// dozens of icons in a list costs nothing until the user actually hovers one.
type EntryTooltipProps = PropsWithChildren<{
	urn: string
	className?: string
}> & Pick<
	TooltipPrimitive.Positioner.Props,
	"align" | "alignOffset" | "side" | "sideOffset"
>

export function EntryTooltip({urn, children, className, ...props}: EntryTooltipProps) {
	const [details, setDetails] = useState<EntryDetailsData | undefined>(undefined);
	const [loading, setLoading] = useState(false);

	return (
		<Tooltip
			onOpenChange={open => {
				if (open && !details && !loading) {
					setLoading(true);
					GetEntryDetailsByURN(urn).then(result => {
						setDetails(result);
						setLoading(false);
					});
				}
			}}
		>
			<TooltipTrigger render={<span className={cn("inline-flex items-center", className)} />}>
				{children}
			</TooltipTrigger>
			<TooltipContent
				side={props.side ?? "top"}
				sideOffset={props.sideOffset ?? 12}
				align={props.align ?? "center"}
				alignOffset={props.alignOffset}
				className={"p-0 max-w-none border-0 bg-transparent shadow-none"}
			>
				{loading || !details ? (
					<div className={"p-3 text-xs text-fg-subtle bg-surface-0 border border-amber-900/40 rounded-sm"}>Loading...</div>
				) : (
					<EntryTooltipCard urn={urn} details={details} />
				)}
			</TooltipContent>
		</Tooltip>
	);
}

function EntryTooltipCard({urn, details}: { urn: string, details: EntryDetailsData }) {
	const kind    = findSourceByURN(urn)?.kind;
	const stats   = flatStats(details.stats);
	const effects = namedGroups(details.stats);

	if (kind === SourceKind.Item) {
		const item = details[kind] as ItemModel | undefined;
		if (item) {
			return <ItemTooltipCard item={item} stats={stats} effects={effects} />;
		}
	}

	// Any other kind (Knowledge, NPC, ...) gets the shared stats/effects card
	// until it needs its own header - nothing to build speculatively yet since
	// only items are shown in a tooltip today.
	return <GenericTooltipCard stats={stats} effects={effects} />;
}

function StatRows({stats}: { stats: ReturnType<typeof flatStats> }) {
	if (stats.length === 0) {
		return null;
	}

	return (
		<div className={"grid grid-cols-2 gap-x-4 gap-y-0.5"}>
			{stats.map(stat => (
				<div key={stat.title} className={"flex flex-row items-center justify-between gap-2"}>
					<span className={"text-fg-subtle"}>{stat.title}</span>
					<span className={"text-fg font-medium"}>{stat.value}</span>
				</div>
			))}
		</div>
	);
}

function ItemTooltipCard({item, stats, effects}: { item: ItemModel, stats: ReturnType<typeof flatStats>, effects: ReturnType<typeof namedGroups> }) {
	const grade      = item.grade as ItemGrade | undefined;
	const gradeColor = getGradeColor(grade, ItemGrades.White);
	const equipLabel = item.equipInfo?.type || item.equipInfo?.slot || item.equipInfo?.kind;

	return (
		<div className={"w-80 overflow-hidden rounded-sm border border-amber-800/40 bg-surface-0/95 shadow-xl"}>
			<div
				className={"relative flex flex-row items-center gap-3 px-3 py-2.5"}
				style={{background : `linear-gradient(to bottom, ${gradeColor.darken(0.35)}, ${gradeColor.darken(0.7)})`}}
			>
				{equipLabel && (
					<span className={"absolute top-1.5 right-2 text-[10px] text-amber-200/70"}>Equipment({equipLabel})</span>
				)}
				<img src={item.icon} alt={item.name} className={"w-10 h-10 shrink-0 rounded-sm border border-black/30"} />
				<span className={"text-base font-bold text-fg"}>{item.name}</span>
			</div>

			<div className={"flex flex-col gap-2 px-3 py-2.5 text-xs"}>
				<StatRows stats={stats} />

				{item.description && (
					<GameText
						text={item.description}
						className={cn("text-fg-muted", stats.length > 0 && "border-t border-amber-900/30 pt-2")}
					/>
				)}

				{effects.length > 0 && (
					<div className={"border-t border-amber-900/30 pt-2"}>
						<EffectSections groups={effects} />
					</div>
				)}
			</div>
		</div>
	);
}

// GenericTooltipCard covers any source kind without a dedicated header - just
// stats/effects, no icon/name/description slot.
function GenericTooltipCard({stats, effects}: { stats: ReturnType<typeof flatStats>, effects: ReturnType<typeof namedGroups> }) {
	if (stats.length === 0 && effects.length === 0) {
		return null;
	}

	return (
		<div className={"w-80 overflow-hidden rounded-sm border border-amber-800/40 bg-surface-0/95 shadow-xl p-3 flex flex-col gap-2 text-xs"}>
			<StatRows stats={stats} />

			{effects.length > 0 && (
				<div className={cn(stats.length > 0 && "border-t border-amber-900/30 pt-2")}>
					<EffectSections groups={effects} />
				</div>
			)}
		</div>
	);
}
