import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import {parseURN} from "@/lib/urn.ts";
import {cn} from "@/lib/utils.ts";
import {MaybeReadonly} from "@/types.ts";
import {HTMLAttributes, ReactNode} from "react";
import {useMiddleClickProps} from "@/utils.tsx";
import {openItemPanel} from "@/state/panels.ts";
import {Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {ItemGrade, getGradeColor} from "@/lib/types/item-grades.ts";

type ItemIconImageProps = {
	urn: string | MaybeReadonly<Item>
	grade?: ItemGrade
	imageClass?: string
	className?: string
	children?: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children" | "style">;

// ItemIconImage is the bare grade-tinted icon visual — no tooltip or navigation.
// It's the shared building block for ItemIcon and anywhere a plain item icon is needed.
export function ItemIconImage({urn, grade, imageClass, className, children, ...rest}: ItemIconImageProps) {
	const urnStr         = typeof urn === "string" ? urn : urn.urn;
	const id             = parseURN(urnStr).id;
	const gradeColor     = getGradeColor(grade);
	const imageClassName = cn("w-5 h-5 shrink-0", imageClass);

	return (
		<div
			{...rest}
			className={cn(imageClassName, className)}
			style={gradeColor ? {
				background : `radial-gradient(circle, ${gradeColor.alpha(0.8)} 0%, ${gradeColor.darken(0.5).alpha(0.5)} 40%, transparent 90%)`,
			} : undefined}
		>
			<img src={`/icons/icons/${id}.webp`} alt={`item: ${id}`} className={imageClassName} />
			{children}
		</div>
	);
}

type ItemIconProps = {
	urn: string | MaybeReadonly<Item>
	className?: string
	imageClass?: string
	grade?: ItemGrade,
	children?: ReactNode,
	clickable?: boolean
}

export function ItemIcon({urn, className, imageClass, grade, children, clickable}: ItemIconProps) {
	const urnStr = typeof urn === "string" ? urn : urn.urn;

	if (clickable && typeof urn === "string") {
		console.error("ItemIcon: clickable is true but urn is a string, cannot open item panel without an Item object");
	}

	return (
		<EntryTooltip urn={urnStr} className={className ? className : "flex-1 min-w-0 gap-2"}>
			<ItemIconImage
				urn={urn}
				grade={grade}
				imageClass={cn(imageClass, typeof urn !== "string" && clickable ? "cursor-pointer" : undefined)}
				{...(clickable && typeof urn !== "string" ? useMiddleClickProps(
					() => openItemPanel(urn, false),
					() => openItemPanel(urn, true),
				) : {})}
			>
				{children}
			</ItemIconImage>
		</EntryTooltip>
	);
}
