import {type MaybeReadonly} from "@/types.ts";
import {type PropsWithChildren, type ReactNode} from "react";
import {useAsync} from "react-async-hook";
import {toggleExpanded, useIsExpanded} from "@/state/global.tsx";
import {ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon} from "lucide-react";
import {cn} from "@/lib/utils.ts";
import {getMiddleClickProps} from "@/utils.tsx";
import {Item, NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetItemsByURN, GetNpcsByURN} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import {openItemPanel, goToURN} from "@/state/panels.ts";
import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import {cva, type VariantProps} from "class-variance-authority";
import {NpcURN} from "@/lib/urn.ts";
import {getGradeColor, ItemGrade, ItemGrades} from "@/lib/types/item-grades.ts";

export type DetailsHeaderProps = {
	title: string
	icon?: string
	grade?: ItemGrade
	lines?: { [key: string]: string | (() => string | undefined) }
}

export function DetailsHeader({title, icon, grade, lines}: DetailsHeaderProps) {
	const gradeColor = grade ? getGradeColor(grade, ItemGrades.White) : undefined;
	return (
		<div className={"flex flex-row gap-8 items-center p-8"}
		     style={{
			     background : grade ? `linear-gradient(to bottom, ${gradeColor.darken(0.5)}, ${gradeColor.darken(0.8)})` : undefined,
		     }}>
			{icon && <img src={icon.startsWith("/icons") ? icon : `/icons/${icon}`} alt={title} className={"w-16 h-16"} />}
			<div className={"flex flex-col gap-2"}>
				<div className={"text-2xl font-bold"}>{title}</div>
				<div>
					{lines && Object.entries(lines).map(([key, value]) => {
						const v = typeof value === "function" ? value() : value;
						if (v === undefined) {
							return null;
						}
						return (
							<div key={key} className={"text-sm text-zinc-400"}>
								{key}: <span className={"font-bold text-zinc-300"}>{v}</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}


export function DetailsSection({title, borderTop, children, expandable = true}: PropsWithChildren<{ title?: string, borderTop?: boolean, expandable?: boolean }>) {

	const id       = `detail-section:${title}`;
	const expanded = useIsExpanded(id);

	return (
		<div className={cn([
			// "mt-4 pt-4",
			borderTop && "border-t border-zinc-700/50"
		])}>
			<div
				className={cn([
					"flex flex-row justify-between items-center p-4",
					expandable && "cursor-pointer select-none group",
				])}
				onClick={expandable ? () => toggleExpanded(id) : undefined}
			>
				{title && <div className={cn([
					"text-lg font-bold ",
					...(expandable ? (
						[
							"group-hover:text-zinc-300 transition-colors duration-150",
							expanded ? "text-zinc-200" : "text-zinc-500"
						]
					) : [
						"text-zinc-200"
					])
				])}>
					{title}
				</div>}
				{expandable && <div>
					<ChevronLeftIcon
						size={18}
						className={cn(
							"shrink-0 text-zinc-500 transition duration-150 group-hover:text-zinc-300",
							expanded && "-rotate-90"
						)}
					/>
				</div>}
			</div>
			{(expandable ? expanded : true) && (
				<div className={"px-4 pb-4"}>
					{children}
				</div>
			)}
		</div>
	);
}

export function DetailsCollapseSection(
	{
		title, id, children,
		containerStyle, titleContainerStyle, contentContainerStyle
	}: PropsWithChildren<{
		title: string | ReactNode,
		id: string,
		containerStyle?: string,
		titleContainerStyle?: string,
		contentContainerStyle?: string
	}>) {

	const expanded = useIsExpanded(id);

	return (
		<div className={cn(["flex flex-col gap-2", containerStyle])}>
			<div className={cn(["flex flex-row gap-2 items-center cursor-pointer", titleContainerStyle])}
			     onClick={() => toggleExpanded(id)}
			>
				<div className={"flex flex-row gap-2 items-center grow"}>
					{typeof title === "string" ? (
						<div className={"text-sm text-zinc-400 font-bold"}>{title}</div>
					) : (
						<div>{title}</div>
					)}
				</div>
				<div className={"text-sm text-zinc-400"}>{!expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}</div>
			</div>
			{expanded && (
				<div className={cn(["flex flex-col gap-2", contentContainerStyle])}>
					{children}
				</div>
			)}
		</div>
	);

}

export function DetailsItemList({itemUrns}: { itemUrns: string[] }) {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const {result: items, loading} = useAsync(() => GetItemsByURN(itemUrns), [itemUrns?.join(",")]);

	if (!itemUrns?.length || loading || !items) {
		return null;
	}

	return (
		<div className={"flex flex-row gap-2 flex-wrap"}>
			{items.map(item => (
				<ItemCardSimple key={item.id} item={item} />
			))}
		</div>
	);
}

export function ItemCardSimple({item}: { item: MaybeReadonly<Item> }) {
	return (
		<div
			className={"flex flex-row gap-2 items-center cursor-pointer"}
			data-testid={"item-card"}
			data-urn={item.urn}
			{...getMiddleClickProps(
				() => openItemPanel(item, false),
				() => openItemPanel(item, true)
			)}
		>
			<EntryTooltip urn={item.urn} className={"gap-2"} side={"top"}>
				<div className={"flex flex-row gap-1 items-center bg-zinc-700/50 px-1.5 py-0.5 rounded-md select-none"}>
					<img src={item.icon} alt={item.name} className={"w-4 h-4"} />
					<span className={"text-sm text-zinc-300"}>{item.name}</span>
				</div>
			</EntryTooltip>
		</div>
	);
}


export function DetailsNpcList({npcUrns}: { npcUrns: MaybeReadonly<string[]> }) {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const {result: npcs, loading} = useAsync(() => GetNpcsByURN([...npcUrns]), [npcUrns?.join(",")]);

	if (!npcUrns?.length || loading || !npcs) {
		return null;
	}

	return (
		<div className={"flex flex-row gap-2 flex-wrap"}>
			{npcs.map(npc => (
				<NpcCardSimple key={npc.id} npc={npc} />
			))}
		</div>
	);
}

export function NpcCardSimple({npc}: { npc: MaybeReadonly<NPC> }) {
	return (
		<div
			className={"flex flex-row gap-2 items-center cursor-pointer"}
			data-testid={"npc-card"}
			data-urn={npc.urn}
			{...getMiddleClickProps(
				() => goToURN(NpcURN.new(npc.id), {title : npc.name}),
				() => goToURN(NpcURN.new(npc.id), {title : npc.name, pinned : true})
			)}
		>
			<div className={"flex flex-row gap-1 items-center bg-zinc-700/50 px-1.5 py-0.5 rounded-md select-none"}>
				{/* <img src={npc.icon} alt={npc.name} className={"w-4 h-4"} /> */}
				<span className={"text-sm text-zinc-300"}>{npc.name}</span>
			</div>
		</div>
	);
}

const chipVariants = cva(
	"bg-zinc-800 rounded-md cursor-pointer hover:bg-zinc-700",
	{
		variants        : {
			variant : {
				md : "px-4 py-2 text-sm font-bold",
				sm : "px-2 py-1 text-xs",
			}
		},
		defaultVariants : {
			variant : "md",
		},
	}
);

export type ChipProps = {
	label: ReactNode,
	onClick?: () => void,
	onMouseDown?: (e: any) => void
	onAuxClick?: (e: any) => void
	variant?: VariantProps<typeof chipVariants>["variant"]
}

export function Chip({label, onClick, onMouseDown, onAuxClick, variant = "md"}: ChipProps) {
	return (
		<div
			className={cn(
				chipVariants({variant}),
				!onClick && "cursor-default"
			)}
			onClick={onClick}
			onMouseDown={onMouseDown}
			onAuxClick={onAuxClick}
		>
			{label}
		</div>
	);
}

export type ChipListProps = {
	section?: string,
	items: Partial<{ id: string | number, name: string }>[] | undefined
	variant?: ChipProps["variant"],
	onClick?: (item: { index: number, id: string | number, name: string }, pinned: boolean) => void
}

export function ChipList({section, items, onClick, variant = "sm"}: ChipListProps) {
	if (!items || items.length === 0) {
		return null;
	}

	if (section === undefined) {
		return (
			<div className="flex flex-row items-center flex-wrap gap-2">
				{items?.map((t, i) => (
					<Chip
						key={t.id}
						label={t.name}
						variant={variant}
						{...getMiddleClickProps(
							() => onClick?.({index : i, id : t.id!, name : t.name!}, false),
							() => onClick?.({index : i, id : t.id!, name : t.name!}, true)
						)}
					/>
				))}
			</div>
		);
	}

	return (
		<DetailsSection title={section} borderTop>
			<div className="flex flex-row items-center flex-wrap gap-2">
				{items?.map((t, i) => (
					<Chip
						key={t.id}
						label={t.name}
						variant={variant}
						{...getMiddleClickProps(
							() => onClick?.({index : i, id : t.id!, name : t.name!}, false),
							() => onClick?.({index : i, id : t.id!, name : t.name!}, true)
						)}
					/>
				))}
			</div>
		</DetailsSection>
	);
}

export function SectionSubtitle({title}: { title?: string }) {
	return <p className="text-sm text-zinc-400 font-semibold mb-2 uppercase">{title}</p>;

}
