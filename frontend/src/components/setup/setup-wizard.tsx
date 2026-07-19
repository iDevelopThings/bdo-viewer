import {RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {ExtractionProgress} from "./extraction-progress.tsx";
import {GameInstallFields} from "./game-install-fields.tsx";
import {useGameInstall} from "@/state/game-install.ts";
import {useExtraction} from "@/state/extraction.ts";

// reasonMessage turns the backend's stale-data reason into user-facing copy.
function reasonMessage(reason: string): string {
	if (reason.startsWith("app updated")) {
		return "BDO Viewer was updated — your extracted data needs refreshing to match the new version.";
	}
	if (reason === "game data changed") {
		return "Black Desert Online was patched. Re-extract to bring your data up to date.";
	}
	return "Your extracted data is from an older version. Re-extract to refresh it.";
}

// SetupWizard is the extraction screen — the first-boot flow (firstRun) where the
// user points at their BDO install, and the re-extraction flow (reason set) shown
// after an update or game patch, where it makes clear why the data must be refreshed.
export function SetupWizard({onComplete, firstRun, reason}: {onComplete: () => void; firstRun: boolean; reason: string}) {
	const install = useGameInstall();
	const {state, run, reset, fraction} = useExtraction(onComplete);

	const busy    = state.status === "running" || state.status === "done";
	const errored = state.status === "error";

	// On a re-extraction (data already exists on disk), let the user open the app with
	// their current data instead of being trapped if extraction won't complete — e.g. a
	// game patch the bundled extractor can't yet parse. Not offered on first run: there's
	// nothing to fall back to. Loading stale data may show outdated values; that's the
	// user's call, and they can re-extract or update from inside the app.
	const skipButton = !firstRun ? (
		<Button variant={"ghost"} size={"sm"} onClick={onComplete}>
			Skip — open with existing data
		</Button>
	) : null;

	return (
		<div className={"flex h-full w-full items-center justify-center overflow-auto bg-surface-0 p-6"}>
			<div className={"flex w-full max-w-lg flex-col gap-6 rounded-xl border border-surface-border bg-surface-1/60 p-6 shadow-xl"}>
				<div className={"flex flex-col gap-1"}>
					<h1 className={"text-lg font-semibold text-fg"}>
						{firstRun ? "Welcome to BDO Viewer" : "Re-extraction needed"}
					</h1>
					<p className={"text-sm text-fg-subtle"}>
						{firstRun
							? "Point the viewer at your Black Desert Online install so it can extract the game data. This runs once — after it finishes the app opens normally."
							: "Confirm your Black Desert Online install and re-extract to refresh your data. After it finishes the app opens normally."}
					</p>
				</div>

				{!firstRun && !busy && !errored && (
					<div className={"flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"}>
						<RefreshCw className={"mt-0.5 size-5 shrink-0 text-amber-400"} />
						<div className={"flex flex-col gap-0.5"}>
							<span className={"text-sm font-medium text-amber-200"}>Your data is out of date</span>
							<span className={"text-xs text-amber-200/80"}>{reasonMessage(reason)}</span>
						</div>
					</div>
				)}

				{!busy && !errored && (
					<>
						<GameInstallFields install={install} />

						<div className={"flex flex-col gap-2"}>
							<Button
								disabled={!install.meta || install.validating || !install.dataDir}
								onClick={() => run(install.gameDir, install.dataDir, install.lang, install.region)}
							>
								{firstRun ? "Extract game data" : "Re-extract game data"}
							</Button>
							{skipButton}
						</div>
					</>
				)}

				{busy && (
					<>
						<ExtractionProgress state={state} fraction={fraction} />
						{state.status === "done" && (
							<p className={"text-sm text-emerald-400"}>Done — loading…</p>
						)}
					</>
				)}

				{errored && (
					<div className={"flex flex-col gap-3"}>
						<p className={"text-sm font-medium text-red-300"}>Extraction failed</p>
						<p className={"text-sm text-red-400"}>{state.error}</p>
						<div className={"flex items-center gap-2"}>
							<Button variant={"outline"} onClick={reset}>Back</Button>
							{skipButton}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
