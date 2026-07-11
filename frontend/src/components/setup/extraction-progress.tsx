import {useEffect, useRef} from "react";
import type {ExtractionState} from "@/state/extraction.ts";

// ExtractionProgress renders the overall + per-item progress bars and a scrolling
// log for a running (or finished) extraction.
export function ExtractionProgress({state, fraction}: {state: ExtractionState; fraction: number}) {
	const logRef = useRef<HTMLPreElement>(null);

	useEffect(() => {
		const el = logRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, [state.log]);

	const subFraction = state.total > 0 ? state.done / state.total : 0;

	return (
		<div className={"flex flex-col gap-4"}>
			<div className={"flex flex-col gap-1.5"}>
				<div className={"flex items-center justify-between text-xs text-zinc-400"}>
					<span>
						{state.step > 0 ? `Step ${state.step}/${state.steps}` : "Starting…"}
						{state.phase ? ` · ${state.phase}` : ""}
					</span>
					<span>{Math.round(fraction * 100)}%</span>
				</div>
				<Bar fraction={fraction} />
			</div>

			{state.total > 0 && (
				<div className={"flex flex-col gap-1.5"}>
					<div className={"flex items-center justify-between text-xs text-zinc-500"}>
						<span>{state.phase}</span>
						<span>{state.done.toLocaleString()} / {state.total.toLocaleString()}</span>
					</div>
					<Bar fraction={subFraction} muted />
				</div>
			)}

			<pre
				ref={logRef}
				className={"h-40 overflow-auto rounded-md border border-input bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap"}
			>
				{state.log.join("\n")}
			</pre>
		</div>
	);
}

function Bar({fraction, muted}: {fraction: number; muted?: boolean}) {
	return (
		<div className={"h-2 w-full overflow-hidden rounded-full bg-zinc-800"}>
			<div
				className={muted ? "h-full bg-zinc-500 transition-all" : "h-full bg-primary transition-all"}
				style={{width: `${Math.max(0, Math.min(1, fraction)) * 100}%`}}
			/>
		</div>
	);
}
