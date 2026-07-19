import {Button} from "@/components/ui/button.tsx";
import {ExtractionProgress} from "./extraction-progress.tsx";
import {GameInstallFields} from "./game-install-fields.tsx";
import {useGameInstall} from "@/state/game-install.ts";
import {useExtraction} from "@/state/extraction.ts";
import {load} from "@/state/load.ts";

// DataExtractionSettings lets the user change the game/data directories after
// first run and re-extract on demand. Re-extraction reloads the in-memory
// dataset when it finishes.
export function DataExtractionSettings() {
	const install = useGameInstall();

	// Re-extraction only rewrites the JSON on disk. Route the reload through the load
	// store so it flows through the same load screen (and refreshes the frontend) as a
	// normal startup load.
	//
	// Then reload the page: module-level caches built from the old dataset (the world
	// map's graph and tiles among them) survive load.reload() and would go on serving
	// the previous data. Only on success — a failed load keeps its error on screen.
	const {state, run, reset, fraction} = useExtraction(() => {
		void load.reload().then(() => {
			if (load.phase === "ready") {
				window.location.reload();
			}
		});
	});

	const running = state.status === "running";

	return (
		<section className={"flex flex-col gap-3"}>
			<h2 className={"text-sm font-semibold text-zinc-200"}>Data & Extraction</h2>
			<p className={"text-xs text-zinc-400"}>
				Where the game is installed and where extracted data lives. Re-extract after a
				game patch to refresh the data.
			</p>

			<GameInstallFields install={install} disabled={running} />

			<div className={"flex items-center gap-3"}>
				<Button
					size={"sm"}
					disabled={!install.valid || running || !install.dataDir}
					onClick={() => run(install.gameDir, install.dataDir, install.lang, install.region)}
				>
					{running ? "Extracting…" : "Re-extract data"}
				</Button>
				{state.status === "done" && <span className={"text-xs text-emerald-400"}>Done — reloaded.</span>}
				{state.status === "error" && (
					<span className={"text-xs text-red-400"}>Failed: {state.error}</span>
				)}
			</div>

			{(running || state.status === "done" || state.status === "error") && (
				<div className={"mt-1"}>
					<ExtractionProgress state={state} fraction={fraction} />
					{state.status === "error" && (
						<Button className={"mt-2"} size={"sm"} variant={"outline"} onClick={reset}>Dismiss</Button>
					)}
				</div>
			)}
		</section>
	);
}
