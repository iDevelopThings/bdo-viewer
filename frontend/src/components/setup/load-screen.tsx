import {useEffect, useRef} from "react";
import {Button} from "@/components/ui/button.tsx";
import type {LoadView} from "@/state/load.ts";

// LoadScreen covers the window while the extracted dataset is loaded into memory in
// the background (the app opens immediately; this fills the gap until it's ready).
export function LoadScreen({state, onRetry}: { state: LoadView; onRetry: () => void }) {
	if (state.phase === "error") {
		return (
			<div className={"flex h-full w-full flex-col items-center justify-center gap-4"}>
				<div>
					<p className={"text-sm text-red-300 max-w-xl text-center font-bold tracking-wide uppercase"}>Failed to load data:</p>
					<p className={"text-sm text-red-400 max-w-xl text-center"}>{state.error}</p>
				</div>
				<Button variant={"outline"} onClick={onRetry}>Try again</Button>
			</div>
		);
	}

	const hasCount = state.total > 0;
	const fraction = hasCount ? state.done / state.total : 0;

	return (
		<div className={"flex h-full w-full items-center justify-center"}>
			<div className={"flex w-80 flex-col gap-3"}>
				<div className={"flex items-center justify-between text-xs text-zinc-400"}>
					<span>{state.stage || "Loading data…"}</span>
					{hasCount && <span>{state.done.toLocaleString()} / {state.total.toLocaleString()}</span>}
				</div>
				<div className={"h-2 w-full overflow-hidden rounded-full bg-zinc-800"}>
					{hasCount ? (
						<div
							className={"h-full bg-primary transition-all"}
							style={{width : `${Math.max(0, Math.min(1, fraction)) * 100}%`}}
						/>
					) : (
						<div className={"h-full w-1/3 animate-pulse rounded-full bg-primary"} />
					)}
				</div>
				{state.log.length > 0 && <LogTail lines={state.log} />}
			</div>
		</div>
	);
}

function LogTail({lines}: { lines: readonly string[] }) {
	const ref = useRef<HTMLPreElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lines]);
	return (
		<pre
			ref={ref}
			className={"h-24 overflow-auto rounded-md border border-input bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-500 whitespace-pre-wrap"}
		>
			{lines.join("\n")}
		</pre>
	);
}
