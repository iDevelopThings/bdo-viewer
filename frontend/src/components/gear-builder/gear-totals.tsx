import {cn} from "@/lib/utils.ts";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useSnapshot} from "valtio/react";

function Total({label, value, highlight}: { label: string, value: number, highlight?: boolean }) {
	return (
		<div className={"flex flex-col items-center gap-0.5"}>
			<span className={cn("text-xs uppercase tracking-wide", highlight ? "text-fg font-semibold" : "text-fg-subtle")}>
				{label}
			</span>
			<span className={cn("text-xl font-bold", highlight ? "text-fg" : "text-fg")}>
				{value}
			</span>
		</div>
	);
}

export function GearTotals() {
	const {stats} = useSnapshot(gearBuilderStore);

	const ap    = stats?.ap ?? 0;
	const aap   = stats?.aap ?? 0;
	const dp    = stats?.dp ?? 0;
	const score = stats?.score ?? 0;

	return (
		<div className={"flex flex-row items-center justify-center gap-10 py-2"}>
			<Total label={"AP"} value={ap} />
			<Total label={"AAP"} value={aap} />
			<Total label={"DP"} value={dp} />
			<Total label={"Score"} value={score} highlight />
		</div>
	);
}
