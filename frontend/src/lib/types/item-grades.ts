import {ItemGrade, ItemGradeByName, ItemGradeInfos} from "@/lib/types/item-grades.gen.ts";
import Color, {ColorInstance} from "color";

export * from "./item-grades.gen.ts";

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
