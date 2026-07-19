import type {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {useSnapshot} from "valtio/react";
import {useState} from "react";
import {ChevronLeft, ChevronRight, History as HistoryIcon} from "lucide-react";
import {getMiddleClickProps} from "@/utils.tsx";
import {openSourceDetails} from "@/state/panels.ts";
import {history} from "@/components/history/history.tsx";
import {ItemIconImage} from "@/lib/item-icon.tsx";

const COLLAPSE_KEY = "history-collapsed";

export function HistoryPanel() {
	const {entries}                 = useSnapshot(history);
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

	if (entries.length === 0) {
		return null;
	}

	const toggle = () => {
		setCollapsed(prev => {
			const next = !prev;
			localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
			return next;
		});
	};

	const open = (entry: UntypedSourceEntry, isMiddle: boolean) => {
		openSourceDetails(entry.type, entry.value, isMiddle);
	};

	return (
		<div className={"flex flex-row items-stretch border-t border-surface-border bg-surface-1 min-w-0"}>
			<button
				type={"button"}
				onClick={toggle}
				title={collapsed ? "Show recent" : "Hide recent"}
				className={"flex flex-row items-center gap-1.5 px-3 shrink-0 text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"}
			>
				<HistoryIcon className={"size-3.5"} />
				<span className={"text-xs uppercase tracking-wide"}>History</span>
				<span className={"text-xs opacity-70"}>{entries.length}</span>
				{collapsed ? <ChevronRight className={"size-3.5"} /> : <ChevronLeft className={"size-3.5"} />}
			</button>

			{!collapsed && (
				<div className={"flex flex-row gap-1.5 px-2 py-1.5 overflow-x-auto min-w-0"}>
					{entries.map((entry, idx) => (
						<div
							key={`${entry.type}:${entry.value?.id ?? idx}`}
							className={"flex flex-row items-center gap-1.5 pl-1 pr-2 py-0.5 bg-surface-2 rounded cursor-pointer select-none hover:bg-surface-3 shrink-0"}
							title={`${entry.type} · ${entry.value?.name ?? ""}`}
							{...getMiddleClickProps(
								() => open(entry, true),
								() => open(entry, false),
							)}
						>
							{entry.type === SourceKind.Item && entry.urn
								? <ItemIconImage urn={entry.urn} imageClass={"w-4 h-4 shrink-0"} />
								: <span className={"text-[10px] uppercase tracking-wide text-fg-subtle px-1"}>{entry.type}</span>}
							<span className={"text-fg-muted text-xs whitespace-nowrap max-w-[160px] truncate"}>
								{entry.value?.name || entry.value?.id}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
