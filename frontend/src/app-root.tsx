import React, {useState, useEffect} from "react";
import type {SetupState} from "@bindings/bdo-viewer/internal/setup";
import {useSnapshot} from "valtio/react";
import {load} from "@/state/load.ts";
import {Status} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {SetupWizard} from "@/components/setup/setup-wizard.tsx";
import {LoadScreen} from "@/components/setup/load-screen.tsx";
import {UpdateBanner} from "@/components/updates/update-banner.tsx";
import {AppLayout} from "@/layout.tsx";
import {AppLayoutV2} from "@/layout-v2.tsx";
import {getLayoutMode} from "@/state/layout-mode.ts";
import {HistoryPanel} from "@/components/history/history-panel.tsx";

export function AppRoot() {
	const [status, setStatus] = useState<SetupState | null>(null);
	const {phase}             = useSnapshot(load);

	useEffect(() => {
		void Status().then(setStatus);
	}, []);

	// Once setup is out of the way, the load store owns bringing the app online —
	// loading the dataset into the backend and pulling it into the frontend, behind one
	// load screen. Skipped during the wizard (there's no dataset to load yet); it kicks
	// in when the wizard completes and flips needsSetup to false. ensure() is idempotent,
	// so the StrictMode double-invoke collapses to one real load.
	useEffect(() => {
		if (status && !status.needsSetup) {
			void load.ensure();
		}
	}, [status]);

	let body: React.ReactNode;
	if (status === null) {
		body = (
			<div className="flex flex-col items-center justify-center h-full w-full">
				<div className="text-zinc-400 text-sm">Checking…</div>
			</div>
		);
	} else if (status.needsSetup) {
		body = (
			<SetupWizard
				firstRun={status.firstRun}
				reason={status.reason}
				onComplete={() => setStatus({...status, needsSetup : false})}
			/>
		);
	} else if (phase !== "ready") {
		body = <LoadScreen onRetry={() => load.reload()} />;
	} else {
		body = (
			<>
				{getLayoutMode() === "v2" ? <AppLayoutV2 /> : <AppLayout />}
				<HistoryPanel />
			</>
		);
	}

	// The update banner sits above every phase — including the setup wizard and load
	// screen — so a build whose bundled extractor a game patch has broken can still be
	// updated out of, instead of trapping the user on a screen that never completes.
	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<UpdateBanner />
			<div className="flex flex-1 min-h-0 w-full flex-col overflow-hidden">
				{body}
			</div>
		</div>
	);
}
