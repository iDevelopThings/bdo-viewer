import type {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {useSnapshot} from "valtio/react";
import {getMiddleClickProps} from "@/utils.tsx";
import {openSourceDetails} from "@/state/panels.ts";
import {history} from "@/components/history/history.tsx";


export function HistoryPanel() {
	const {entries} = useSnapshot(history);

	const open = (entry: UntypedSourceEntry, isMiddle: boolean) => {
		openSourceDetails(entry.type, entry.value, isMiddle);
	};
	return (
		<div className={"flex flex-row items-center"}
		     style={{
			     borderTopColor : "var(--border)",
			     borderTopWidth : "1px",
			     borderTopStyle : "solid"
		     }}
		>
			<div className="text-zinc-400 text-xs px-2 py-1">
				HISTORY
			</div>

			<div className="flex flex-row gap-2 px-2 py-1 overflow-x-auto">
				{entries.map((entry, idx) => (
					<div
						key={`${entry.type}:${entry.value?.id ?? idx}`}
						className="flex flex-row items-center gap-1 px-2 py-1 bg-zinc-800/50 rounded-sm cursor-pointer select-none hover:bg-zinc-700/50"
						{...getMiddleClickProps(
							() => open(entry, true),
							() => open(entry, false)
						)}
					>
						<span className="text-zinc-400 text-xs">{entry.type}</span>
						<span className="text-zinc-200 text-xs whitespace-nowrap">{entry.value?.name || entry.value?.id}</span>
					</div>
				))}
			</div>

		</div>
	);
}
