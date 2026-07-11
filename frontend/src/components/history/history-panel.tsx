import {persist} from "valtio-persist";
import {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {useSnapshot} from "valtio/react";
import {useMiddleClickProps} from "@/utils.tsx";
import {openItemPanel} from "@/state/panels.ts";
import {isItem} from "@/state/sources/item-source.tsx";

export type HistoryState = {
	entries: UntypedSourceEntry[];
}
export const {store : history} = await persist<HistoryState>({
	entries : []
}, "history");

export function addHistoryEntry(entry: UntypedSourceEntry) {
	const idx = history.entries.findIndex(e => {
		if (e.urn || entry.urn) {
			return e.urn === entry.urn;
		}
		return e.type === entry.type && e.value?.id === entry.value?.id;
	});

	if (idx >= 0) {
		history.entries.splice(idx, 1);
	}

	history.entries.unshift(entry);

	if (history.entries.length > 20) {
		history.entries.pop();
	}
}

export function HistoryPanel() {
	const h = useSnapshot(history);

	const open = (entry: UntypedSourceEntry, isMiddle: boolean) => {
		if (isItem(entry)) {
			openItemPanel(entry.value, isMiddle);
		}
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
				{h.entries.map((entry, idx) => (
					<div
						key={idx}
						className="flex flex-row items-center gap-1 px-2 py-1 bg-zinc-800/50 rounded-sm cursor-pointer select-none hover:bg-zinc-700/50"
						{...useMiddleClickProps(
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
