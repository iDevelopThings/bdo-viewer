import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import {cn} from "@/lib/utils.ts";
import {useState, type HTMLAttributes, type ReactNode} from "react";
import {getMiddleClickProps} from "@/utils.tsx";
import {goToURN} from "@/state/panels.ts";
import type {ItemGrade} from "@/lib/types/item-grades.ts";
import {getGradeColorScale} from "@/lib/types/item-grades.ts";

// The backend resolves a urn to the right icon per source (see Catalog.ServeHTTP),
// so the frontend never needs to know a source's on-disk icon scheme.
function iconSrc(urn: string): string {
	return `/icons/by-urn/${encodeURIComponent(urn)}`;
}

type EntryIconImageProps = {
	urn: string
	grade?: ItemGrade
	imageClass?: string
	className?: string
	children?: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children" | "style">;

// EntryIconImage is the bare grade-tinted icon visual — no tooltip or navigation.
// It's the shared building block for EntryIcon and anywhere a plain entry icon is needed.
export function EntryIconImage({urn, grade, imageClass, className, children, ...rest}: EntryIconImageProps) {
	const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);

	const scale          = getGradeColorScale(grade);
	const imageClassName = cn("w-5 h-5 shrink-0", imageClass);

	const src = iconSrc(urn);

	// A urn with no icon (regions, un-seeded npcs) 404s at /icons/by-urn/<urn> — hide
	// rather than show a broken image. Keyed to src so a later urn can still render.
	if (failedSrc === src) {
		return null;
	}

	return (
		<div
			{...rest}
			className={cn(imageClassName, className)}
			style={scale ? {
				background : `radial-gradient(circle, ${scale.itemBackground[0]} 0%, ${scale.itemBackground[1]} 40%, transparent 90%)`,
			} : undefined}
		>
			<img src={src} alt={urn} className={imageClassName} onError={() => setFailedSrc(src)} />
			{children}
		</div>
	);
}

type EntryIconProps = {
	urn: string
	// Panel-tab title when clickable — the panel self-titles from the entry it loads,
	// so this is only a hint to avoid the tab briefly showing the raw urn.
	title?: string
	className?: string
	imageClass?: string
	grade?: ItemGrade,
	children?: ReactNode,
	clickable?: boolean
}

export function EntryIcon({urn, title, className, imageClass, grade, children, clickable}: EntryIconProps) {
	return (
		<EntryTooltip urn={urn} className={className ? className : "flex-1 min-w-0 gap-2"}>
			<EntryIconImage
				urn={urn}
				grade={grade}
				imageClass={cn(imageClass, clickable ? "cursor-pointer" : undefined)}
				{...(clickable ? getMiddleClickProps(
					() => goToURN(urn, {title, pinned : true}),
					() => goToURN(urn, {title}),
				) : {})}
			>
				{children}
			</EntryIconImage>
		</EntryTooltip>
	);
}
