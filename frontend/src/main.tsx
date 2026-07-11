import React, {useEffect, useState} from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import {AppLayout} from "./Layout.tsx";
import {TooltipProvider} from "@/components/ui/tooltip.tsx";
import {HistoryPanel} from "@/components/history/history-panel.tsx";
import {useSnapshot} from "valtio/react";
import {sources, loadSources} from "@/state/sources/sources.ts";
import {installDevHelpers} from "@/lib/dev.ts";
import {SetupWizard} from "@/components/setup/setup-wizard.tsx";
import {UpdateBanner} from "@/components/updates/update-banner.tsx";
import {NeedsSetup} from "@bindings/bdo-viewer/internal/setup/service.ts";




window.addEventListener("keydown", (e) => {
	if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
		e.preventDefault();
		window.location.reload();
	}
});

installDevHelpers();

export function AppRoot() {
	const srcs = useSnapshot(sources);
	const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

	useEffect(() => {
		void NeedsSetup().then(setNeedsSetup);
	}, []);

	// Only load sources once we know the dataset exists — before then the backend
	// has nothing to serve and the setup wizard owns the screen.
	useEffect(() => {
		if (needsSetup === false) {
			loadSources();
		}
	}, [needsSetup]);

	if (needsSetup === null) {
		return (
			<div className="flex flex-col items-center justify-center h-full w-full">
				<div className="text-zinc-400 text-sm">Checking…</div>
			</div>
		);
	}

	if (needsSetup) {
		return <SetupWizard onComplete={() => setNeedsSetup(false)} />;
	}

	if (srcs.loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full w-full">
				<div className="text-zinc-400 text-sm">Loading sources...</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			<UpdateBanner />
			<AppLayout />
			<HistoryPanel/>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<TooltipProvider delay={300}>
			<AppRoot />
		</TooltipProvider>
	</React.StrictMode>,
);
