import {useMemo} from "react";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {aggregateGearStats} from "@/state/gear/gear-stats.ts";
import {cn} from "@/lib/utils.ts";

function Total({label, value, highlight}: { label: string, value: number, highlight?: boolean }) {
	return (
		<div className={"flex flex-col items-center gap-0.5"}>
			<span className={cn("text-xs uppercase tracking-wide", highlight ? "text-white font-semibold" : "text-zinc-400")}>
				{label}
			</span>
			<span className={cn("text-xl font-bold", highlight ? "text-white" : "text-zinc-200")}>
				{value}
			</span>
		</div>
	);
}

export function GearTotals() {
	const [, snap] = useGearBuild();

	const {totals} = useMemo(
		() => aggregateGearStats(snap),
		[snap.slots, snap.loading]
	);
	const score = Math.round((totals.ap + totals.aap) / 2 + totals.dp);

	return (
		<div className={"flex flex-row items-center justify-center gap-10 py-2"}>
			<Total label={"AP"} value={totals.ap} />
			<Total label={"AAP"} value={totals.aap} />
			<Total label={"DP"} value={totals.dp} />
			<Total label={"Score"} value={score} highlight />
		</div>
	);
}
