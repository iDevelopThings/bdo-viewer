import React, {useState, useEffect} from "react";
import type {SetupState} from "@bindings/bdo-viewer/internal/setup";
import {useSnapshot} from "valtio/react";
import {load} from "@/state/load.ts";
import {Status} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {SetupWizard} from "@/components/setup/setup-wizard.tsx";
import {LoadScreen} from "@/components/setup/load-screen.tsx";
import {UpdateBanner} from "@/components/updates/update-banner.tsx";
import {AppLayout} from "@/layout.tsx";
import {HistoryPanel} from "@/components/history/history-panel.tsx";

export function AppRoot() {
	const [status, setStatus] = useState<SetupState | null>(null);
	const loadState           = useSnapshot(load);

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

	if (status === null) {
		return (
			<div className="flex flex-col items-center justify-center h-full w-full">
				<div className="text-zinc-400 text-sm">Checking…</div>
			</div>
		);
	}

	if (status.needsSetup) {
		return (
			<SetupWizard
				firstRun={status.firstRun}
				reason={status.reason}
				onComplete={() => setStatus({...status, needsSetup : false})}
			/>
		);
	}

	if (loadState.phase !== "ready") {
		return <LoadScreen state={loadState} onRetry={() => load.reload()} />;
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<UpdateBanner />
			<AppLayout />
			<HistoryPanel />
		</div>
	);
}
