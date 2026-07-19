import {Fragment, useEffect, useMemo, useRef, useState} from "react";
import {useSnapshot} from "valtio/react";
import {Plus, X} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {Slider} from "@/components/ui/slider.tsx";
import {EntryPicker} from "@/components/entry-list/entry-picker.tsx";
import {addToCompare, type CompareEntry, clearCompare, compare, removeFromCompare} from "@/state/compare.ts";
import {EffectSections} from "@/components/details/effects.tsx";
import {flatStats, namedGroups} from "@/lib/stat-groups.ts";
import {cn} from "@/lib/utils.ts";
import {GetStatsByURN, GetEntryDetailsByURN} from "@bindings/bdo-viewer/internal/sources/sourceregistry.ts";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import type {Stat, StatGroup} from "@bindings/bdo-viewer/internal/stats";
import type {Item as ItemModel} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";

type ColumnResult = {
	stats: StatGroup[];
};

// One compared item's header + level/Caphras sliders. Owns its own enchant
// level/Caphras step state and recomputes stats via GetStatsByURN whenever
// either changes, reporting the result up to the parent (which needs every
// column's stats at once to build the unioned diff table).
function CompareColumn({entry, onRemove, onResult}: {
	entry: CompareEntry;
	onRemove: () => void;
	onResult: (result: ColumnResult) => void;
}) {
	const [item, setItem]               = useState<ItemModel | undefined>(undefined);
	const [level, setLevel]             = useState(0);
	const [caphrasStep, setCaphrasStep] = useState(0);


	const loadedRef      = useRef(false);
	const lastFetchedRef = useRef({level : 0, caphrasStep : 0});

	useEffect(() => {
		let cancelled = false;

		GetEntryDetailsByURN(entry.urn).then(details => {
			if (cancelled) return;

			const it           = details?.[SourceKind.Item] as ItemModel | undefined;
			const levels       = it?.enhancement?.levels ?? [];
			const initialLevel = levels[0]?.level ?? 0;

			lastFetchedRef.current = {level : initialLevel, caphrasStep : 0};
			loadedRef.current      = true;
			setItem(it);
			setLevel(initialLevel);
			setCaphrasStep(0);
			onResult({stats : details?.stats ?? []});
		});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entry.urn]);

	useEffect(() => {
		if (!loadedRef.current) {
			return; // bundled load hasn't resolved yet - nothing to recompute against
		}
		if (lastFetchedRef.current.level === level && lastFetchedRef.current.caphrasStep === caphrasStep) {
			return; // already have this exact combination from the bundled load
		}
		lastFetchedRef.current = {level, caphrasStep};

		let cancelled = false;

		GetStatsByURN(entry.urn, level, caphrasStep).then(stats => {
			if (cancelled) return;
			onResult({stats : stats ?? []});
		});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [level, caphrasStep]);

	const levels         = item?.enhancement?.levels ?? [];
	const minLevel       = levels[0]?.level ?? 0;
	const maxLevel       = levels[levels.length - 1]?.level ?? 0;
	const enchant        = levels.find(l => l.level === level);
	const caphrasLevels  = enchant?.caphras ?? [];
	const maxCaphrasStep = caphrasLevels.length > 0 ? Math.max(...caphrasLevels.map(c => c.level)) : 0;

	return (
		<div className={"flex flex-col gap-2 p-2 border-b border-surface-border min-w-0"}>
			<div className={"flex flex-row items-center gap-1.5"}>
				{entry.icon && <img src={entry.icon} alt={entry.title} className={"w-6 h-6 shrink-0"} />}
				<span className={"text-sm font-semibold truncate flex-1"} title={entry.title}>
					{entry.title}
				</span>
				<Button variant={"ghost"} size={"icon-xs"} onClick={onRemove}>
					<X />
				</Button>
			</div>

			{maxLevel > minLevel && (
				<div className={"flex flex-row items-center gap-2"}>
					<span className={"text-xs text-fg-subtle shrink-0 w-14"} title={`Lv ${level}`}>
						{enchant?.name ?? "Base"}
					</span>
					<Slider value={level} onValueChange={v => setLevel(v as number)} min={minLevel} max={maxLevel} step={1} />
				</div>
			)}

			{maxCaphrasStep > 0 && (
				<div className={"flex flex-row items-center gap-2"}>
					<span className={"text-xs text-fg-subtle shrink-0 w-14"}>Caphras {caphrasStep}</span>
					<Slider
						value={caphrasStep}
						onValueChange={v => setCaphrasStep(v as number)}
						min={0}
						max={maxCaphrasStep}
						step={1}
					/>
				</div>
			)}
		</div>
	);
}

export function CompareItemsPanel() {
	const {entries} = useSnapshot(compare);

	const [pickerOpen, setPickerOpen] = useState(false);
	const [results, setResults]       = useState<Record<string, ColumnResult>>({});

	const urns = entries.map(e => e.urn);

	const {titles, statByUrnTitle, maxRawByTitle} = useMemo(() => {
		const urns = entries.map(e => e.urn);

		// Only the title-less (Card/main Effects) groups are comparable in the diff table below -
		// the titled effect groups render as their own sections further down instead. Titles are
		// collected in first-seen order so the table grows to fit whichever item has the rarest stats.
		const byUrn            = new Map<string, Map<string, Stat>>();
		const titles: string[] = [];
		const seen             = new Set<string>();
		for (const urn of urns) {
			const m = new Map<string, Stat>();
			for (const stat of flatStats(results[urn]?.stats)) {
				if (!m.has(stat.title)) {
					m.set(stat.title, stat);
				}
				if (!seen.has(stat.title)) {
					seen.add(stat.title);
					titles.push(stat.title);
				}
			}
			byUrn.set(urn, m);
		}

		// The highlight compares Stat.Raw (the pre-format number), not the display string -
		// "285.0m" vs "1.2b" never look equal, but that's not what we want to flag. Only the row's
		// largest raw value(s) get highlighted, and only when the compared items actually disagree
		// (a single distinct raw value among them isn't a "larger" one). Stats with no Raw (plain
		// AddString) can't be compared this way and are never highlighted.
		const maxRawByTitle = new Map<string, number>();
		for (const title of titles) {
			const raws: number[] = [];
			for (const urn of urns) {
				const raw = byUrn.get(urn)?.get(title)?.raw;
				if (raw !== undefined) {
					raws.push(raw);
				}
			}
			if (new Set(raws).size >= 2) {
				maxRawByTitle.set(title, Math.max(...raws));
			}
		}

		return {titles, statByUrnTitle : byUrn, maxRawByTitle};
	}, [entries, results]);

	const statFor = (urn: string, title: string) => statByUrnTitle.get(urn)?.get(title);

	return (
		<div className={"relative flex flex-col h-full max-h-full overflow-hidden"}>
			<div className={"flex flex-row items-center gap-2 p-2 border-b border-surface-border"}>
				<span className={"font-semibold text-sm"}>Compare Items</span>
				<Button variant={"outline"} size={"xs"} className={"ml-auto"} onClick={() => setPickerOpen(true)}>
					<Plus /> Add Item
				</Button>
				{entries.length > 0 && (
					<Button variant={"ghost"} size={"xs"} onClick={() => clearCompare()}>
						Clear All
					</Button>
				)}
			</div>

			<div className={"flex-1 overflow-auto"}>
				{entries.length === 0 ? (
					<div className={"p-4 text-sm text-fg-subtle"}>
						No items to compare yet — click "Add Item" to get started.
					</div>
				) : (
					<>
						<div
							className={"grid"}
							style={{gridTemplateColumns : `160px repeat(${urns.length}, minmax(160px, 1fr))`}}
						>
							<div className={"border-b border-surface-border"} />
							{entries.map(entry => (
								<CompareColumn
									key={entry.urn}
									entry={entry}
									onRemove={() => removeFromCompare(entry.urn)}
									onResult={result => setResults(prev => ({...prev, [entry.urn] : result}))}
								/>
							))}

							{titles.map(title => {
								const max = maxRawByTitle.get(title);
								return (
									<Fragment key={title}>
										<div className={"text-xs text-fg-subtle p-2 border-b border-surface-border/50 flex items-center"}>
											{title}
										</div>
										{urns.map(urn => {
											const stat = statFor(urn, title);
											return (
												<div
													key={`${urn}:${title}`}
													className={cn(
														"text-sm p-2 border-b border-surface-border/50 text-center",
														max !== undefined && stat?.raw === max && "bg-green-500/10",
													)}
												>
													{stat?.value ?? "—"}
												</div>
											);
										})}
									</Fragment>
								);
							})}
						</div>

						<div className={"flex flex-row gap-4 p-4"}>
							{entries.map(entry => {
								const groups = namedGroups(results[entry.urn]?.stats);
								if (groups.length === 0) {
									return <div key={entry.urn} className={"flex-1 min-w-35"} />;
								}
								return (
									<div key={entry.urn} className={"flex-1 min-w-35"}>
										<EffectSections groups={groups} />
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>

			{pickerOpen && (
				<EntryPicker
					title={"Add item to compare"}
					fields={["grade", "effect"]}
					onPick={entry => {
						if (entry.urn) {
							addToCompare({urn : entry.urn, title : entry.title, icon : entry.icon});
						}
					}}
					onClose={() => setPickerOpen(false)}
				/>
			)}
		</div>
	);
}
