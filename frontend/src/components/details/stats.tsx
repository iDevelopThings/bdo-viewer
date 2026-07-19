import type {Stat} from "@bindings/bdo-viewer/internal/stats";
import {flatStats} from "@/lib/stat-groups.ts";
import {DetailsSection} from "@/components/details/details-components.tsx";
import {useDetail} from "@/state/detail.tsx";
import {useMarketPriceLabel} from "@/lib/market-data.tsx";
import {isItem} from "@/state/sources/sources.ts";

export type StatCardProps = {
	title: string;
	value: string;
}

// StatCard renders a stat title/value pair exactly as formatted by the
// backend (internal/stats.Stat) - no client-side reformatting.
export function StatCard({title, value}: StatCardProps) {
	return (
		<div className={"flex flex-col gap-1 px-4 py-2 bg-zinc-800 rounded-md"}>
			<div className={"text-sm font-bold"}>{value}</div>
			<div className={"text-sm text-zinc-500 uppercase"}>{title}</div>
		</div>
	);
}

// DetailsStats renders every source kind's top-level stats identically - the
// per-kind branching (item vs knowledge vs ...) already happened server-side
// in Source.GetStats.
export function DetailsStats() {
	const [, d] = useDetail();

	// Market Price is a live value from a separate client-side feed (not part
	// of bdoextract's static dump), so it's the one stat still sourced here
	// rather than from d.stats - spliced in right after Sell Price to match
	// where it sat in the old per-field layout.
	const item        = isItem(d.entry) ? d.entry.value : undefined;
	const marketPrice = useMarketPriceLabel(item?.id);

	const stats: Stat[] = flatStats(d.stats);
	if (marketPrice) {
		const sellIdx = stats.findIndex(s => s.title === "Sell Price");
		const marketStat: Stat = {title : "Market Price", value : marketPrice};
		if (sellIdx === -1) {
			stats.push(marketStat);
		} else {
			stats.splice(sellIdx + 1, 0, marketStat);
		}
	}

	if (stats.length === 0) {
		return null;
	}

	return (
		<DetailsSection title={"Stats"} borderTop>
			<div className={"flex flex-row items-center flex-wrap gap-4"}>
				{stats.map(stat => (
					<StatCard key={stat.title} title={stat.title} value={stat.value} />
				))}
			</div>
		</DetailsSection>
	);
}
