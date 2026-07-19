import {ItemGrade, ItemGradeByName, ItemGradeInfos, type ItemGradeNames} from "@/lib/types/item-grades.gen.ts";
import Color, {ColorInstance} from "color";

export * from "./item-grades.gen.ts";

// Selectable grades for filter UIs, ordered by value and display-cased. Negative-value
// entries are sentinels (e.g. "any"), not real grades, so they're excluded.
export const gradeOptions = Object.values(ItemGradeInfos)
	.sort((a, b) => a.value - b.value)
	.filter(g => g.value >= 0)
	.map(g => ({name : g.name[0].toUpperCase() + g.name.slice(1), value : g.value}));

export const gradeColors = Object.fromEntries(
	Object.entries(ItemGradeInfos)
		.filter(([, info]) => info.color != null)
		.map(([name, info]) => [name as ItemGradeNames, Color(info.color as string)])
);


export type GradeColorData = {
	color: ColorInstance
	itemBackground: [string, string]
	detailBackground: [string, string]
}
export const gradeColorScales: { [key in ItemGradeNames]?: GradeColorData } = Object.fromEntries(
	Object.entries(ItemGradeInfos)
		.filter(([, info]) => info.color != null)
		.map(([, info]) => {
				const color = Color(info.color as string);
				return [
					info.name,
					{
						color            : color,
						itemBackground   : [color.alpha(0.8).string(), color.darken(0.5).alpha(0.5).string()],
						detailBackground : [color.darken(0.5).string(), color.darken(0.8).string()],
					}
				];
			}
		)
);

export const gradeColorScalesByGrade: { [key in ItemGrade]?: GradeColorData } = Object.fromEntries(
	Object.entries(gradeColorScales)
		.map(([name, data]) => [ItemGradeByName[name as ItemGradeNames], data])
);

export function getGradeColorScale(grade?: ItemGrade | ItemGradeNames, fallback?: ItemGrade | ItemGradeNames | undefined): GradeColorData | undefined {
	if (grade == null && fallback == null) {
		return undefined;
	}

	if (typeof grade === "string") {
		grade = ItemGradeByName[grade];
	}

	if (grade == null && fallback != null) {
		if (typeof fallback === "string") {
			fallback = ItemGradeByName[fallback];
		}
		grade = fallback;
	}

	return gradeColorScalesByGrade[grade as ItemGrade];
}

export function tryGetGradeColor(grade?: string, fallback?: ItemGrade | undefined): ColorInstance | undefined {
	// check if grade looks like a number:
	if (grade != null && !isNaN(Number(grade))) {
		const gradeNum = Number(grade);
		return getGradeColor(ItemGradeInfos[gradeNum as ItemGrade]?.value, fallback);
	}

	if (grade) {
		return getGradeColor(grade, fallback);
	}
	return undefined;
}

export function getGradeColor(
	grade?: ItemGrade | string,
	fallback?: ItemGrade | undefined
): ColorInstance | undefined {
	if (grade == null)
		return undefined;


	if (typeof grade === "string") {
		grade = ItemGradeByName[grade];
	}
	if (grade == null && fallback == null) {
		return undefined;
	}

	grade = grade ?? fallback;

	return Color(ItemGradeInfos[grade].color);
}

