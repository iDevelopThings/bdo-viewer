import {IDockviewPanelProps} from "dockview-react";
import {useSnapshot} from "valtio/react";
import {sources} from "@/state/sources/sources.ts";
import {navigate, navigation, toggleExpanded} from "@/state/navigation.tsx";
import {cva, type VariantProps} from "class-variance-authority";
import {cn} from "@/lib/utils.ts";
import type {DeepReadonly} from "@/types.ts";
import {Calculator, ChevronRight, GitCompare, Map, Settings, Swords} from "lucide-react";
import {openCompareItemsPanel, openCraftCalculatorPanel, openGearBuilderPanel, openSettingsPanel, openMapPanel} from "@/state/panels.ts";
import {SourceNavigationNode} from "@bindings/bdo-viewer/internal/sources";
import {useEffect, useRef} from "react";

export function Sidebar(props: IDockviewPanelProps) {

	const srcs = useSnapshot(sources);
	const nav  = useSnapshot(navigation);

	if (srcs.loading) {
		return <div>Loading...</div>;
	}

	return <div className={"flex flex-col p-1 overflow-y-auto"} style={{maxHeight : "100%"}} data-panel={"sidebar"}>
		<div
			className={cn(sidebarNodeVariants({variant : "root"}), "pl-2 mb-1")}
			data-testid={"sidebar-node"}
			data-nav-path={"gear-builder"}
			onClick={() => openGearBuilderPanel()}
		>
			<Swords className={"size-3.5 shrink-0 text-zinc-500"} />
			<span className={"truncate"}>Gear Builder</span>
		</div>

		<div
			className={cn(sidebarNodeVariants({variant : "root"}), "pl-2 mb-1")}
			data-testid={"sidebar-node"}
			data-nav-path={"craft-calculator"}
			onClick={() => openCraftCalculatorPanel()}
		>
			<Calculator className={"size-3.5 shrink-0 text-zinc-500"} />
			<span className={"truncate"}>Crafting Calculator</span>
		</div>

		<div
			className={cn(sidebarNodeVariants({variant : "root"}), "pl-2 mb-1")}
			data-testid={"sidebar-node"}
			data-nav-path={"compare-items"}
			onClick={() => openCompareItemsPanel()}
		>
			<GitCompare className={"size-3.5 shrink-0 text-zinc-500"} />
			<span className={"truncate"}>Compare Items</span>
		</div>

		<div
			className={cn(sidebarNodeVariants({variant : "root"}), "pl-2 mb-1")}
			data-testid={"sidebar-node"}
			data-nav-path={"map"}
			onClick={() => openMapPanel()}
		>
			<Map className={"size-3.5 shrink-0 text-zinc-500"} />
			<span className={"truncate"}>World Map</span>
		</div>
		<div
			className={cn(sidebarNodeVariants({variant : "root"}), "pl-2 mb-1")}
			data-testid={"sidebar-node"}
			data-nav-path={"settings"}
			onClick={() => openSettingsPanel()}
		>
			<Settings className={"size-3.5 shrink-0 text-zinc-500"} />
			<span className={"truncate"}>Settings</span>
		</div>

		{nav.rootNodes.map(node => (
			<SidebarNode key={node.id} node={node} parent={node} depth={0} />
		))}
	</div>;
}

const sidebarNodeVariants = cva(
	"flex w-full items-center gap-1.5 py-1.5 pr-2 cursor-pointer select-none " +
	"data-[active=true]:bg-zinc-800 data-[active=true]:text-white",
	{
		variants        : {
			variant : {
				// Top-level source categories read as section headers.
				root : "text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white",
				// Nested items are regular, lower-emphasis nav rows.
				child : "text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white",
			}
		},
		defaultVariants : {
			variant : "child",
		},
	}
);

// How far each depth level indents the row's content, in rem.
const INDENT_STEP = 1;
const INDENT_BASE = 0.5;

type SidebarNodeProps = {
	node: DeepReadonly<SourceNavigationNode>
	parent?: DeepReadonly<SourceNavigationNode>
	depth: number
}


export function SidebarNode({node, parent, depth}: SidebarNodeProps) {
	const nav = useSnapshot(navigation);

	const nodeRef = useRef<HTMLDivElement>(null);

	const hasChildren = !!node.children?.length;
	const isActive    = nav.activePath === node.path;
	const expanded    = nav.expandedPaths.includes(node.path);

	useEffect(() => {
		if (isActive) {
			if (nodeRef.current) {
				nodeRef.current.scrollIntoView({behavior : "smooth", block : "nearest"});
			}
		}
	}, [isActive]);

	const variant: VariantProps<typeof sidebarNodeVariants>["variant"] = depth === 0 ? "root" : "child";

	const onClick = () => {
		if (hasChildren) {
			toggleExpanded(node.path);
		} else {
			navigate(node.path);
		}
	};

	return (
		<div className={"flex flex-col w-full"} ref={nodeRef}>
			<div
				className={cn(sidebarNodeVariants({variant}))}
				style={{paddingLeft : `${INDENT_BASE + depth * INDENT_STEP}rem`}}
				data-active={isActive}
				data-testid={"sidebar-node"}
				data-nav-path={node.path}
				data-urn={node.urn}
				onClick={onClick}
			>
				{hasChildren ? (
					<ChevronRight
						className={cn(
							"size-3.5 shrink-0 text-zinc-500 transition-transform duration-150",
							expanded && "rotate-90"
						)}
					/>
				) : (
					<span className={"size-3.5 shrink-0"} />
				)}
				<span className={"truncate"}>{node.title}</span>
			</div>
			{hasChildren && expanded && (
				<div className={"flex flex-col w-full"}>
					<SidebarNode key={`sbn:${parent.id}:${node.path}_ALL_`} node={{
						id       : node.id,
						urn      : node.urn,
						path     : node.path,
						count    : node.count,
						source   : node.source,
						children : [],
						title    : "All"
					}} depth={depth + 1} parent={parent} />

					{node.children.map(child => (
						<SidebarNode key={`sbnc:${node.id}:${child.id}`} node={child} parent={node} depth={depth + 1} />
					))}
				</div>
			)}
		</div>
	);
}
