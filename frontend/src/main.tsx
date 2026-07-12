import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import {TooltipProvider} from "@/components/ui/tooltip.tsx";
import {installDevHelpers} from "@/lib/dev.ts";
import {AppRoot} from "@/app-root.tsx";


window.addEventListener("keydown", (e) => {
	if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
		e.preventDefault();
		window.location.reload();
	}
});

installDevHelpers();

// Reuse a single React root across hot-reloads. main.tsx runs at module scope, and
// when Vite HMR re-executes it (an edit anywhere in its import graph), calling
// createRoot again on the same #root that already has a root produces a second root
// fighting over the same DOM node — which surfaces as "createRoot() on a container
// that has already been passed to createRoot()" and a removeChild NotFoundError. Cache
// the root so a re-run just re-renders into it.
const container = document.getElementById("root") as HTMLElement;
const globalForRoot = window as unknown as {__reactRoot?: ReactDOM.Root};
const root = globalForRoot.__reactRoot ?? (globalForRoot.__reactRoot = ReactDOM.createRoot(container));

root.render(
	<React.StrictMode>
		<TooltipProvider delay={300}>
			<AppRoot />
		</TooltipProvider>
	</React.StrictMode>,
);
