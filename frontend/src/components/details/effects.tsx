import {type DeepReadonly, grades} from "@/types.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";

// Renders titled StatGroups (Enhancement Effect, Set Effect, Stats, Hidden,
// Caphras Enhancement, ...) as a 2-column table per section: label, then
// value in the game's yellow highlight color. Untitled groups (Card/the main
// AP-DP-etc. Effects group) aren't meant for this renderer - see
// lib/stat-groups.ts's namedGroups/flatStats split.
export function EffectSections({groups}: { groups: DeepReadonly<StatGroup[]> }) {
	if (groups.length === 0) {
		return null;
	}

	return (
		<div className={"flex flex-col gap-4"}>
			{groups.map(group => (
				<div key={group.title}>
					<div className={"text-sm font-semibold text-zinc-300 mb-1"}>{group.title}</div>
					<table className={"border-separate border-spacing-x-4 border-spacing-y-0.5"}>
						<tbody>
							{(group.stats ?? []).map((stat, i) => (
								<tr key={i}>
									<td className={"text-sm text-zinc-400 whitespace-nowrap"}>{stat.title}</td>
									<td className={"text-sm font-medium"} style={{color : grades.yellow.color}}>{stat.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			))}
		</div>
	);
}
