import {memo, useCallback, useMemo, useState} from "react";
import {Search} from "lucide-react";
import {Input} from "@/components/ui/input.tsx";
import {Tooltip, TooltipContent} from "@/components/ui/tooltip.tsx";
import {cn} from "@/lib/utils.ts";
import {type DeepReadonly} from "@/types.ts";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {StatId, StatIds, StatIdInfos} from "@/lib/types/stats.gen.ts";
import {StatSource} from "@bindings/bdo-viewer/internal/gear";
import {ItemIconImage} from "@/lib/item-icon.tsx";
import {ItemGrade, getGradeColor} from "@/lib/types/item-grades.ts";
import {useSnapshot} from "valtio/react";

type StatSources = DeepReadonly<StatSource[]> | null;
type SourceItem = { urn: string, grade?: ItemGrade };

type PanelConfig = { title: string, rows: StatId[] };

const panelConfig: PanelConfig[] = [
	{
		title : "Offense (Succession)",
		rows  : [
			StatIds.TotalAp, StatIds.ApVsAdventurer, StatIds.ApVsMonster, StatIds.ApVsHuman,
			StatIds.ApVsKamasylvian, StatIds.ApVsNormal, StatIds.ApVsDemihuman, StatIds.ApVsEdania,
		],
	},
	{
		title : "Offense (Awakening)",
		rows  : [
			StatIds.TotalAwakeningAp, StatIds.AwakeningApVsAdventurer, StatIds.AwakeningApVsMonster,
			StatIds.AwakeningApVsHuman, StatIds.AwakeningApVsKamasylvian, StatIds.AwakeningApVsNormal,
			StatIds.AwakeningApVsDemihuman, StatIds.AwakeningApVsEdania,
		],
	},
	{title : "Offense", rows : [StatIds.HiddenAp, StatIds.Accuracy]},
	{
		title : "Defense (Damage Reduction)",
		rows  : [
			StatIds.MeleeDamageReduction, StatIds.RangedDamageReduction, StatIds.MagicDamageReduction,
			StatIds.DamageReduction, StatIds.HiddenDamageReduction, StatIds.MonsterDamageReduction,
			StatIds.MeleeMonsterDamageReduction, StatIds.RangedMonsterDamageReduction, StatIds.MagicMonsterDamageReduction,
		],
	},
	{
		title : "Defense (Evasion)",
		rows  : [StatIds.Evasion, StatIds.HiddenEvasion, StatIds.MeleeEvasion, StatIds.RangedEvasion, StatIds.MagicEvasion],
	},
	{
		title : "Bonuses",
		rows  : [
			StatIds.BracketAp, StatIds.BracketAwakeningAp, StatIds.DamageReductionRate,
			StatIds.BracketMonsterAp, StatIds.BracketMonsterAwakeningAp,
		],
	},
	{title : "Basic", rows : [StatIds.MaxHp, StatIds.MaxResource, StatIds.MaxStamina]},
	{
		title : "Resistance",
		rows  : [
			StatIds.AllResistance, StatIds.StunResistance, StatIds.GrappleResistance,
			StatIds.KnockdownResistance, StatIds.KnockbackResistance,
		],
	},
	{
		title : "Additional",
		rows  : [
			StatIds.CritDamage, StatIds.SpeedAttackDamage, StatIds.BackAttackDamage, StatIds.DownAttackDamage,
			StatIds.AirAttackDamage, StatIds.CounterAttackDamage, StatIds.SpecialAttackDamage,
			StatIds.MonsterAp, StatIds.AdventurerAp,
		],
	},
	{title : "Enhancement", rows : [StatIds.AttackSpeedLevel, StatIds.CastingSpeedLevel, StatIds.MovementSpeedLevel]},
	{
		title : "Gathering",
		rows  : [
			StatIds.GatheringMastery, StatIds.LumberingMastery, StatIds.FluidCollectorMastery, StatIds.HoeMastery,
			StatIds.ButcherMastery, StatIds.TanningMastery, StatIds.PickaxeMastery,
			StatIds.GatheringDropRate, StatIds.GatheringSpeed, StatIds.GatheringTime,
		],
	},
	{
		title : "Processing",
		rows  : [
			StatIds.ProcessingMastery, StatIds.ShakingMastery, StatIds.GrindingMastery, StatIds.ChoppingMastery,
			StatIds.DryingMastery, StatIds.FilteringMastery, StatIds.HeatingMastery,
		],
	},
	{
		title : "Life Skill",
		rows  : [
			StatIds.AllMastery, StatIds.FishingMastery, StatIds.HuntingMastery, StatIds.CookingMastery,
			StatIds.AlchemyMastery, StatIds.TrainingMastery, StatIds.SailingMastery, StatIds.TradingMastery,
			StatIds.FarmingMastery, StatIds.FishingSpeed, StatIds.LifeExp,
		],
	},
	{title : "Other", rows : [StatIds.WeightLimit]},
];

type Row = { label: string, value: string, sources?: StatSources, srcUrns?: string };
type PanelData = { title: string, rows: Row[] };

// Plain rows — no per-row tooltip. A single shared tooltip in the panel re-anchors to the hovered
// row (base-ui's controlled Root + Positioner anchor). Memoized so a re-render that didn't touch
// this row (hover, search typing) skips it — the panel has ~100 rows and used to mount a base-ui
// Tooltip per sourced row (~84 of them), which was the real re-render cost under rapid updates.
const StatRow = memo(function StatRow({row, stripe, onHover}: {
	row: Row,
	stripe: string,
	onHover: (row: Row | null, anchor: HTMLElement | null) => void,
}) {
	const hasSources = row.sources && row.sources.length > 0;
	const rowClass   = cn(
		"flex flex-row items-center justify-between gap-2 px-2.5 py-1 text-sm", stripe,
		hasSources && "cursor-help hover:bg-surface-2/60",
	);

	return (
		<div
			className={rowClass}
			data-hl-src={row.srcUrns}
			onMouseEnter={e => onHover(hasSources ? row : null, hasSources ? e.currentTarget : null)}
		>
			<span className={"text-fg-subtle truncate"}>{row.label}</span>
			<span className={"text-fg font-medium shrink-0"}>{row.value}</span>
		</div>
	);
});

export function GearStatsPanel() {
	const {slots, stats, consumables} = useSnapshot(gearBuilderStore);

	const [filter, setFilter]   = useState("");
	const [hovered, setHovered] = useState<{row: Row, anchor: HTMLElement} | null>(null);

	const handleHover = useCallback((row: Row | null, anchor: HTMLElement | null) => {
		setHovered(row && anchor ? {row, anchor} : null);
	}, []);

	// Map an equipped item's display name -> its urn/grade so a stat source
	// ("Red Nose's Armor", "Red Nose's Armor: Caphras") can show the item's icon.
	const itemBySource = useMemo(() => {
		const m = new Map<string, SourceItem>();
		for (const slot of slots ?? []) {
			const it = slot.item;
			if (it?.title) {
				m.set(it.title, {urn : it.urn, grade : it.extra?.grade});
			}
		}
		for (const it of consumables ?? []) {
			if (it?.name) {
				m.set(it.name, {urn : it.urn, grade : it.grade});
			}
		}
		return m;
	}, [slots, consumables]);

	const resolveSource = useCallback(
		(name: string): SourceItem | undefined =>
			itemBySource.get(name) ?? itemBySource.get(name.split(":")[0].trim()),
		[itemBySource],
	);

	// Built only when the stats actually change — not on every render (e.g. search keystrokes).
	const sections: PanelData[] = useMemo(
		() => stats
			? panelConfig.map(cfg => ({
				title : cfg.title,
				rows  : cfg.rows.map((statId): Row => {
					const info = StatIdInfos[statId];
					if (!info) {
						return {label : `UNKNOWN STAT ${statId}`, value : "N/A"};
					}
					const stat = stats.stats[statId];
					// URNs of the items contributing to this row, for hover highlighting
					// (computed here so it's memoized with the stats, not per render).
					const srcUrns = stat?.sources
						? [...new Set(stat.sources.map(s => resolveSource(s.name)?.urn).filter(Boolean))].join(" ")
						: undefined;
					return {
						label   : info.label,
						value   : `${stat?.total ?? 0}${info.unit ?? ""}`,
						sources : stat?.sources,
						srcUrns : srcUrns || undefined,
					};
				}),
			}))
			: [],
		[stats, resolveSource],
	);

	const query    = filter.trim().toLowerCase();
	const filtered = useMemo(
		() => query
			? sections
				.map(s => ({...s, rows : s.rows.filter(r => r.label.toLowerCase().includes(query))}))
				.filter(s => s.rows.length > 0)
			: sections,
		[query, sections],
	);

	return (
		<div className={"flex flex-col w-64 shrink-0 border-l border-surface-border max-h-full overflow-hidden"}>
			<div className={"relative p-2 border-b border-surface-border"}>
				<Search className={"absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-fg-subtle pointer-events-none"} />
				<Input
					placeholder="Search for Stats"
					className={"h-8 pl-7 text-sm"}
					value={filter}
					onChange={e => setFilter(e.target.value)}
				/>
			</div>

			<div
				className={"flex flex-col flex-1 min-h-0 gap-3 p-2 overflow-y-auto"}
				onMouseLeave={() => setHovered(null)}
			>
				{filtered.map(section => (
					<div key={section.title} className={"flex flex-col shrink-0 rounded-md overflow-hidden border border-surface-border"}>
						<div className={"px-2.5 py-1.5 bg-surface-1 text-xs font-semibold text-fg"}>
							{section.title}
						</div>
						<div className={"flex flex-col"}>
							{section.rows.map((row, i) => (
								<StatRow
									key={row.label}
									row={row}
									stripe={i % 2 === 1 ? "bg-surface-1/40" : ""}
									onHover={handleHover}
								/>
							))}
						</div>
					</div>
				))}
				{filtered.length === 0 && (
					<div className={"text-sm text-fg-subtle p-2"}>No matching stats</div>
				)}
			</div>

			{/* One shared tooltip re-anchored to the hovered row — replaces ~84 per-row tooltips. */}
			<Tooltip open={hovered !== null} onOpenChange={o => !o && setHovered(null)}>
				<TooltipContent
					anchor={hovered?.anchor}
					side="left"
					sideOffset={8}
					className={"flex flex-col items-stretch gap-0 w-60 max-w-none p-0 border border-surface-border bg-surface-0 text-fg shadow-xl rounded-md overflow-hidden"}
				>
					{hovered && (
						<>
							<div className={"flex flex-row items-center justify-between gap-3 px-3 py-2 border-b border-surface-border bg-surface-1/60"}>
								<span className={"text-sm font-semibold text-fg truncate"}>{hovered.row.label}</span>
								<span className={"text-sm font-semibold tabular-nums text-emerald-400 shrink-0"}>{hovered.row.value}</span>
							</div>
							<div className={"flex flex-col py-1 max-h-80 overflow-y-auto"}>
								{hovered.row.sources!.map((src, j) => {
									const item       = resolveSource(src.name);
									const gradeColor = getGradeColor(item?.grade);
									return (
										<div key={j} className={"flex flex-row items-center gap-2 px-3 py-1"}>
											{item
												? <ItemIconImage urn={item.urn} grade={item.grade} imageClass={"size-5"} />
												: <div className={"size-5 shrink-0 rounded-sm bg-surface-2/80"} />}
											<span
												className={"flex-1 min-w-0 truncate text-xs text-fg-muted"}
												style={gradeColor ? {color : gradeColor.toString()} : undefined}
											>
												{src.name}
											</span>
											<span className={"text-xs font-medium tabular-nums text-fg-subtle shrink-0"}>{src.value}</span>
										</div>
									);
								})}
							</div>
						</>
					)}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
