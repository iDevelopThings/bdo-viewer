import {type DeepReadonly} from "@/types.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import {ItemGradeInfos, ItemGrades} from "@/lib/types/item-grades.gen.ts";


export function EffectSections({groups}: { groups: DeepReadonly<StatGroup[]> }) {
	if (groups.length === 0) {
		return null;
	}

	return (
		<div className={"flex flex-col gap-4"}>
			{groups.map((group, i) => (
				<div key={`${group.title}-${i}`}>
					<div className={"text-sm font-semibold text-fg-muted mb-1"}>{group.title}</div>
					<table className={"w-full border-separate border-spacing-x-4 border-spacing-y-0.5"}>
						<tbody>
						{(group.stats ?? []).map((stat, i) => (
							<tr key={i}>
								<td className={"text-sm text-fg-subtle break-words"}>{stat.title}</td>
								<td className={"text-sm font-medium whitespace-nowrap text-right align-top"} style={{color : ItemGradeInfos[ItemGrades.Yellow].color}}>{stat.value}</td>
							</tr>
						))}
						</tbody>
					</table>
				</div>
			))}
		</div>
	);
}
