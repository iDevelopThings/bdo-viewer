import {type MaybeReadonly, type MaybeNullable} from "@/types.ts";
import {type PropsWithChildren, type ReactNode, useCallback} from "react";
import {useAsync} from "react-async-hook";
import {toggleExpanded, useIsExpanded} from "@/state/global.tsx";
import {ChevronLeftIcon, MapPinIcon} from "lucide-react";
import {cn} from "@/lib/utils.ts";
import {getMiddleClickProps} from "@/utils.tsx";
import {type Item, type NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetItemsByURN, GetNpcsByURN, GetNodesByUrn} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import {goToURN, type GoToURNOptions, openMapAtNode} from "@/state/panels.ts";
import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import {EntryIconImage} from "@/lib/entry-icon.tsx";
import {cva, type VariantProps} from "class-variance-authority";
import {getGradeColorScale, type ItemGrade, ItemGrades} from "@/lib/types/item-grades.ts";
import type {URN} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/urn";
import {Button} from "@/components/ui/button.tsx";

export type DetailsHeaderProps = {
	title?: string
	// Source urn of the entity whose icon to show; resolved via /icons/by-urn and
	// self-hides when the source has no icon (regions, un-seeded npcs).
	urn?: string
	grade?: ItemGrade
	lines?: { [key: string]: string | (() => string | undefined) }
}

export function DetailsHeader({title, urn, grade, lines}: DetailsHeaderProps) {
	const scale = grade ? getGradeColorScale(grade, ItemGrades.White) : undefined;

	const copyLine = useCallback(async (label: string, value: string) => {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// Clipboard can fail off a secure context; ignore.
		}
	}, []);

	return (
		<div className={"flex flex-row gap-5 items-center px-6 py-5"}
		     style={{
			     background : scale ? `linear-gradient(to bottom, ${scale.detailBackground[0]}, ${scale.detailBackground[1]})` : undefined,
		     }}>
			{urn && <EntryIconImage urn={urn} imageClass={"w-14 h-14"} />}
			<div className={"flex flex-col gap-1.5"}>
				<div className={"text-xl font-bold"}>{title}</div>
				<div>
					{lines && Object.entries(lines).map(([key, value]) => {
						const v = typeof value === "function" ? value() : value;
						if (v === undefined) {
							return null;
						}
						const label = key.replace(/:\s*$/, "");
						return (
							<div
								key={key}
								className={"text-sm text-fg-subtle cursor-pointer hover:text-fg-muted"}
								title={`Copy ${label}`}
								onClick={() => void copyLine(label, v)}
							>
								{label}: <span className={"font-bold text-fg-muted"}>{v}</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** Shared outer layout for every entity detail view. */
export function DetailsShell({header, children}: PropsWithChildren<{ header: ReactNode }>) {
	return (
		<div className="flex flex-col grow">
			{header}
			<div className={"gap-8 pb-8"}>
				{children}
			</div>
		</div>
	);
}


export function DetailsSection({title, borderTop, children, expandable = true}: PropsWithChildren<{ title?: string, borderTop?: boolean, expandable?: boolean }>) {

	const id       = `detail-section:${title}`;
	const expanded = useIsExpanded(id);

	return (
		<div className={cn([
			borderTop && "border-t border-surface-border/50"
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
							"group-hover:text-fg-muted transition-colors duration-150",
							expanded ? "text-fg" : "text-fg-subtle"
						]
					) : [
						"text-fg"
					])
				])}>
					{title}
				</div>}
				{expandable && <div>
					<ChevronLeftIcon
						size={18}
						className={cn(
							"shrink-0 text-fg-subtle transition duration-150 group-hover:text-fg-muted",
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

export type EntityChipProps = {
	urn?: string | null
	name: string
	icon?: boolean
	// compact drops the name label for a bare [icon ×count] chip — the tooltip still
	// identifies it on hover. Used for dense ingredient rows.
	compact?: boolean
	tooltip?: boolean
	grade?: ItemGrade
	prefer?: GoToURNOptions["prefer"]
	trailing?: ReactNode
	className?: string
}

/** One clickable entity reference — always navigates via goToURN when a urn is present. */
export function EntityChip({urn, name, icon = true, compact, tooltip = true, grade, prefer, trailing, className}: EntityChipProps) {
	const open = (pinned: boolean) => {
		if (!urn) {
			return;
		}
		goToURN(urn, {title : name, pinned, prefer});
	};

	const body = (
		<div className={cn(
			"flex flex-row gap-1 items-center bg-surface-3/50 px-1.5 py-0.5 rounded-md select-none",
			urn && "cursor-pointer",
			className,
		)}>
			{icon && urn && <EntryIconImage urn={urn} grade={grade} imageClass={"w-4 h-4"} />}
			{!compact && <span className={"text-sm text-fg-muted"}>{name}</span>}
			{trailing}
		</div>
	);

	const interactive = urn ? (
		<div
			className={"flex flex-row gap-2 items-center"}
			data-testid={"entity-chip"}
			data-urn={urn}
			{...getMiddleClickProps(
				() => open(true),
				() => open(false),
			)}
		>
			{tooltip ? <EntryTooltip urn={urn} className={"gap-2"} side={"top"}>{body}</EntryTooltip> : body}
		</div>
	) : body;

	return interactive;
}

export function DetailsItemList({itemUrns}: { itemUrns: URN[] | null }) {
	const {result : items, loading} = useAsync(() => GetItemsByURN(itemUrns), [itemUrns]);

	if (!itemUrns?.length || loading || !items) {
		return null;
	}

	return (
		<div className={"flex flex-row gap-2 flex-wrap"}>
			{items.map(item => (
				item && <ItemCardSimple key={item.urn} item={item} />
			))}
		</div>
	);
}

export function ItemCardSimple({item}: { item: MaybeReadonly<Item> }) {
	return (
		<EntityChip
			urn={item.urn}
			name={item.name ?? item.urn}
			grade={item.grade}
		/>
	);
}

export function DetailsNpcList({npcUrns}: { npcUrns: MaybeReadonly<string[]> }) {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const {result : npcs, loading} = useAsync(() => GetNpcsByURN([...npcUrns]), [npcUrns.join(",")]);

	if (!npcUrns.length || loading || !npcs) {
		return null;
	}

	return (
		<div className={"flex flex-row gap-2 flex-wrap"}>
			{npcs.map(npc => (
				npc && <NpcCardSimple key={npc.id} npc={npc} />
			))}
		</div>
	);
}

export function NpcCardSimple({npc}: { npc: MaybeReadonly<NPC> }) {
	return (
		<EntityChip
			urn={npc.urn}
			name={npc.name}
			icon={false}
			tooltip={false}
		/>
	);
}

export function DetailsNodeList({nodeUrns}: { nodeUrns: MaybeReadonly<string[]> }) {
	const {result : nodes, loading} = useAsync(() => GetNodesByUrn([...nodeUrns]), [nodeUrns]);

	if (!nodeUrns.length || loading || !nodes) {
		return null;
	}

	return (
		<div className={"flex flex-row gap-2 flex-wrap"}>
			{nodes
				.map((node) => {
					if (!node) {
						return null;
					}
					return (
						<MapChip
							key={`gather-node-${node.urn}`}
							label={(
								<>
									{`${node.parentNode?.name ?? node.name}`}
									<span className={"text-fg-subtle"}>{node.name}</span>
								</>
							)}
							onClick={() => openMapAtNode(node.urn)}
						/>
					);
				})}
		</div>
	);
}

const chipVariants = cva(
	"inline-flex w-fit items-center bg-surface-2 rounded-md hover:bg-surface-3",
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
	onClick?: (e?: any) => void
	onMouseDown?: (e: any) => void
	onAuxClick?: (e: any) => void
	variant?: VariantProps<typeof chipVariants>["variant"]
	className?: string
}

export function Chip({label, onClick, onMouseDown, onAuxClick, variant = "md", className}: ChipProps) {
	return (
		<div
			className={cn(
				chipVariants({variant}),
				onClick ? "cursor-pointer" : "cursor-default hover:bg-surface-2",
				className,
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
	items: MaybeNullable<Partial<{ urn: string | null, name: string }>[]>
	variant?: ChipProps["variant"],
	onClick?: (item: { index: number, urn?: MaybeNullable<string>, name: string }, pinned: boolean) => void
}

export function ChipList({section, items, onClick, variant = "sm"}: ChipListProps) {
	if (!items || items.length === 0) {
		return null;
	}

	const chips = (
		<div className="flex flex-row items-center flex-wrap gap-2">
			{items.map((t, i) => (
				<Chip
					key={t.urn ?? i}
					label={t.name}
					variant={variant}
					{...(onClick ? getMiddleClickProps(
						() => onClick({index : i, urn : t.urn, name : t.name!}, true),
						() => onClick({index : i, urn : t.urn, name : t.name!}, false),
					) : {})}
				/>
			))}
		</div>
	);

	if (section === undefined) {
		return chips;
	}

	return (
		<DetailsSection title={section} borderTop>
			{chips}
		</DetailsSection>
	);
}

/** A chip that flies the map to a position or node. */
export function MapChip({label, onClick}: { label: ReactNode, onClick: () => void }) {
	return (
		<Chip
			variant={"sm"}
			onClick={onClick}
			label={(
				<span className={"flex flex-row items-center gap-1.5"}>
					{label}
					<MapPinIcon size={11} className={"text-fg-subtle"} />
				</span>
			)}
		/>
	);
}

/**
 * Split chip: left side opens an entity (detail panel), right side flies the map.
 * Used for vendors / NPC spawn rows — `{name} | {location} 📍`.
 */
export function EntityMapChip(
	{
		name,
		subtitle,
		location,
		onOpen,
		onMap,
	}: {
		name: string
		subtitle?: string
		location?: string
		/** Left click opens; middle click pins when the callback receives pinned=true. */
		onOpen?: (pinned: boolean) => void
		onMap?: () => void
	},
) {
	return (
		<div className="inline-flex w-fit items-center gap-1.5 bg-surface-2 rounded-md px-2 py-1 text-xs">
			{onOpen ? (
				<Button
					variant="plain"
					size="inline"
					className="gap-1.5"
					{...getMiddleClickProps(
						() => onOpen(true),
						() => onOpen(false),
					)}
				>
					<span className="font-medium text-fg-muted">{name}</span>
					{subtitle && <span className="text-fg-subtle">{subtitle}</span>}
				</Button>
			) : (
				<span className="flex flex-row items-center gap-1.5">
					<span className="font-medium text-fg-muted">{name}</span>
					{subtitle && <span className="text-fg-subtle">{subtitle}</span>}
				</span>
			)}
			{onMap && (
				<Button
					variant="plain"
					size="inline"
					title={location ? `Show ${location} on the map` : "Show on map"}
					className="gap-1 text-fg-subtle border-l border-surface-border/60 pl-1.5"
					onClick={onMap}
				>
					{location && <span>{location}</span>}
					<MapPinIcon size={11} />
				</Button>
			)}
		</div>
	);
}

export function SectionSubtitle({title}: { title?: string }) {
	return <p className="text-sm text-fg-subtle font-semibold mb-2 uppercase">{title}</p>;

}
