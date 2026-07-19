import {Button} from "@/components/ui/button.tsx";
import {useUpdates} from "@/state/updates.ts";

// UpdateBanner shows a slim prompt when a newer release is available, then drives
// the download → restart flow. It renders nothing when there's no update.
export function UpdateBanner() {
	const {state, install, restart, dismiss} = useUpdates();

	if (state.status === "idle") {
		return null;
	}

	const pct = state.progress.total > 0
		? Math.round((state.progress.written / state.progress.total) * 100)
		: 0;

	return (
		<div className={"flex items-center gap-3 border-b border-surface-border bg-surface-1/80 px-4 py-2 text-sm text-fg"}>
			{state.status === "available" && (
				<>
					<span className={"flex-1"}>
						Version <span className={"font-medium text-emerald-400"}>{state.release?.version}</span> is available.
					</span>
					<Button size={"sm"} onClick={install}>Install update</Button>
					<Button size={"sm"} variant={"ghost"} onClick={dismiss}>Later</Button>
				</>
			)}
			{state.status === "downloading" && (
				<>
					<span className={"flex-1"}>Downloading update… {pct > 0 ? `${pct}%` : ""}</span>
					<div className={"h-1.5 w-40 overflow-hidden rounded-full bg-surface-2"}>
						<div className={"h-full bg-primary transition-all"} style={{width: `${pct}%`}} />
					</div>
				</>
			)}
			{state.status === "ready" && (
				<>
					<span className={"flex-1 text-emerald-400"}>Update ready — restart to apply.</span>
					<Button size={"sm"} onClick={restart}>Restart now</Button>
					<Button size={"sm"} variant={"ghost"} onClick={dismiss}>Later</Button>
				</>
			)}
			{state.status === "error" && (
				<>
					<span className={"flex-1 text-red-400"}>Update failed: {state.error}</span>
					<Button size={"sm"} variant={"ghost"} onClick={dismiss}>Dismiss</Button>
				</>
			)}
		</div>
	);
}
