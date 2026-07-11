import {useMemo, useState} from "react";
import {Search} from "lucide-react";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {aggregateGearStats} from "@/state/gear/gear-stats.ts";
import {Input} from "@/components/ui/input.tsx";

export function GearStatsPanel() {
	const [, snap] = useGearBuild();

	const [filter, setFilter] = useState("");

	// Recompute when any equipped item or level changes - slots is the
	// reactive dependency that captures both.
	const {sections} = useMemo(
		() => aggregateGearStats(snap),
		[snap.slots, snap.loading]
	);

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
							{section.rows.map(row => (
								<div
									key={row.label}
									className={"flex flex-row items-center justify-between gap-2 px-2.5 py-1 odd:bg-zinc-900/40 text-sm"}
								>
									<span className={"text-zinc-400 truncate"}>{row.label}</span>
									<span className={"text-zinc-100 font-medium shrink-0"}>{row.value}</span>
								</div>
							))}
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
