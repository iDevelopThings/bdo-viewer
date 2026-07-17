import {useState} from "react";
import {Search} from "lucide-react";
import {Input} from "@/components/ui/input.tsx";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {cn} from "@/lib/utils.ts";
import {type DeepReadonly} from "@/types.ts";
import {useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {StatId, StatIds, StatIdInfos} from "@/lib/types/stats.gen.ts";
import {StatSource} from "@bindings/bdo-viewer/internal/gear";
import {ItemIconImage} from "@/lib/item-icon.tsx";
import {tryGetGradeColor, ItemGrade, getGradeColor} from "@/lib/types/item-grades.ts";

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

export function GearStatsPanel() {
	const [builder]           = useGearBuilderStore();
	const [filter, setFilter] = useState("");

	// Map an equipped item's display name -> its urn/grade so a stat source
	// ("Red Nose's Armor", "Red Nose's Armor: Caphras") can show the item's icon.
	const itemBySource = new Map<string, SourceItem>();
	for (const slot of builder.slots ?? []) {
		const it = slot.item;
		if (it?.name) {
			itemBySource.set(it.name, {urn : it.urn, grade : it.grade});
		}
	}
	const resolveSource = (name: string): SourceItem | undefined =>
		itemBySource.get(name) ?? itemBySource.get(name.split(":")[0].trim());

	type Row = { label: string, value: string, sources?: StatSources };
	type PanelData = { title: string, rows: Row[] };

	const sections: PanelData[] = builder.stats
		? panelConfig.map(cfg => ({
			title : cfg.title,
			rows  : cfg.rows.map((statId): Row => {
				const info = StatIdInfos[statId];
				if (!info) {
					return {label : `UNKNOWN STAT ${statId}`, value : "N/A"};
				}
				const stat = builder.stats!.stats[statId];
				return {
					label   : info.label,
					value   : `${stat?.total ?? 0}${info.unit ?? ""}`,
					sources : stat?.sources,
				};
			}),
		}))
		: [];

	const query    = filter.trim().toLowerCase();
	const filtered = query
		? sections
			.map(s => ({...s, rows : s.rows.filter(r => r.label.toLowerCase().includes(query))}))
			.filter(s => s.rows.length > 0)
		: sections;

	return (
		<div className={"flex flex-col w-64 shrink-0 border-l border-zinc-800 max-h-full overflow-hidden"}>
			<div className={"relative p-2 border-b border-zinc-800"}>
				<Search className={"absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500 pointer-events-none"} />
				<Input
					placeholder="Search for Stats"
					className={"h-8 pl-7 text-sm"}
					value={filter}
					onChange={e => setFilter(e.target.value)}
				/>
			</div>

			<div className={"flex flex-col flex-1 min-h-0 gap-3 p-2 overflow-y-auto"}>
				{filtered.map(section => (
					<div key={section.title} className={"flex flex-col shrink-0 rounded-md overflow-hidden border border-zinc-800"}>
						<div className={"px-2.5 py-1.5 bg-zinc-900 text-xs font-semibold text-zinc-200"}>
							{section.title}
						</div>
						<div className={"flex flex-col"}>
							{section.rows.map((row, i) => {
								const stripe     = i % 2 === 1 ? "bg-zinc-900/40" : "";
								const rowClass   = cn("flex flex-row items-center justify-between gap-2 px-2.5 py-1 text-sm", stripe);
								const hasSources = row.sources && row.sources.length > 0;

								if (!hasSources) {
									return (
										<div key={row.label} className={rowClass}>
											<span className={"text-zinc-400 truncate"}>{row.label}</span>
											<span className={"text-zinc-100 font-medium shrink-0"}>{row.value}</span>
										</div>
									);
								}

								return (
									<Tooltip key={row.label}>
										<TooltipTrigger render={<div className={cn(rowClass, "cursor-help hover:bg-zinc-800/60")} />}>
											<span className={"text-zinc-400 truncate"}>{row.label}</span>
											<span className={"text-zinc-100 font-medium shrink-0"}>{row.value}</span>
										</TooltipTrigger>
										<TooltipContent
											side="left"
											sideOffset={8}
											className={"flex flex-col items-stretch gap-0 w-60 max-w-none p-0 border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl rounded-md overflow-hidden"}
										>
											<div className={"flex flex-row items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60"}>
												<span className={"text-sm font-semibold text-zinc-100 truncate"}>{row.label}</span>
												<span className={"text-sm font-semibold tabular-nums text-emerald-400 shrink-0"}>{row.value}</span>
											</div>
											<div className={"flex flex-col py-1 max-h-80 overflow-y-auto"}>
												{row.sources!.map((src, j) => {
													const item       = resolveSource(src.name);
													const gradeColor = getGradeColor(item?.grade);
													return (
														<div key={j} className={"flex flex-row items-center gap-2 px-3 py-1"}>
															{item
																? <ItemIconImage urn={item.urn} grade={item.grade} imageClass={"size-5"} />
																: <div className={"size-5 shrink-0 rounded-sm bg-zinc-800/80"} />}
															<span
																className={"flex-1 min-w-0 truncate text-xs text-zinc-300"}
																style={gradeColor ? {color : gradeColor.toString()} : undefined}
															>
																{src.name}
															</span>
															<span className={"text-xs font-medium tabular-nums text-zinc-400 shrink-0"}>{src.value}</span>
														</div>
													);
												})}
											</div>
										</TooltipContent>
									</Tooltip>
								);
							})}
						</div>
					</div>
				))}
				{filtered.length === 0 && (
					<div className={"text-sm text-zinc-500 p-2"}>No matching stats</div>
				)}
			</div>
		</div>
	);
}
