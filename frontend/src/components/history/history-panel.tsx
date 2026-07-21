import type {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {useSnapshot} from "valtio/react";
import {BookOpen, ChevronLeft, ChevronRight, History as HistoryIcon, MapPin, Package, Swords, User} from "lucide-react";
import {getMiddleClickProps} from "@/utils.tsx";
import {openSourceDetails} from "@/state/panels.ts";
import {history} from "@/components/history/history.tsx";
import {EntryIconImage} from "@/lib/entry-icon.tsx";
import {useIsExpanded, toggleExpanded} from "@/state/global.tsx";

const COLLAPSE_KEY = "history-collapsed";

// History mixes every source, not just items. Items show their real icon; the rest get a
// per-kind glyph so every chip still reads with a leading icon.
function SourceGlyph({type}: { type: string }) {
	const cls = "w-4 h-4 shrink-0 text-fg-subtle";
	switch (type as SourceKind) {
		case SourceKind.Npc:
		case SourceKind.Character:
			return <User className={cls} />;
		case SourceKind.Knowledge:
			return <BookOpen className={cls} />;
		case SourceKind.Region:
			return <MapPin className={cls} />;
		case SourceKind.GrindSpot:
			return <Swords className={cls} />;
		default:
			return <Package className={cls} />;
	}
}

export function HistoryPanel() {
	const {entries} = useSnapshot(history);

	const expanded = useIsExpanded(COLLAPSE_KEY);

	const toggle = () => toggleExpanded(COLLAPSE_KEY);

	const open = (entry: UntypedSourceEntry, isMiddle: boolean) => {
		if (!entry.urn) {
			return;
		}
		openSourceDetails(entry.type, entry.urn, {title : entry.value?.name, pinned : isMiddle});
	};

	return (
		<div className={"flex flex-row items-stretch border-t border-surface-border bg-surface-1 min-w-0"}>
			<button
				type={"button"}
				onClick={toggle}
				title={!expanded ? "Show recent" : "Hide recent"}
				className={"flex flex-row items-center gap-1.5 px-3 shrink-0 text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"}
			>
				<HistoryIcon className={"size-3.5"} />
				<span className={"text-xs uppercase tracking-wide"}>History</span>
				<span className={"text-xs opacity-70"}>{entries.length}</span>
				{!expanded ? <ChevronRight className={"size-3.5"} /> : <ChevronLeft className={"size-3.5"} />}
			</button>

			{expanded && (
				<div className={"flex flex-row gap-1.5 px-2 py-1.5 overflow-x-auto min-w-0"}>
					{entries.map(entry => (
						<div
							key={entry.urn}
							className={"flex flex-row items-center gap-1.5 pl-1 pr-2 py-0.5 bg-surface-2 rounded cursor-pointer select-none hover:bg-surface-3 shrink-0"}
							title={`${entry.type} · ${entry.value?.name ?? ""}`}
							{...getMiddleClickProps(
								() => open(entry, true),
								() => open(entry, false),
							)}
						>
							{entry.type === SourceKind.Item && entry.urn
								? <EntryIconImage urn={entry.urn} imageClass={"w-4 h-4 shrink-0"} />
								: <SourceGlyph type={entry.type} />}
							<span className={"text-fg-muted text-xs whitespace-nowrap max-w-40 truncate"}>
								{entry.value?.name || entry.value?.id}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
