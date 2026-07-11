import {goToURN, openItemPanel, openSourceDetails} from "@/state/panels.ts";
import {sources} from "@/state/sources/sources.ts";
import {navigation} from "@/state/navigation.tsx";
import {list} from "@/state/list.tsx";
import {snapshot} from "valtio/vanilla";

// installDevHelpers wires debugging conveniences onto window in DEV builds only
// (a no-op in production): `window.__app` to navigate by URN and inspect live
// state, and `window.__errors` as a rolling buffer of console.error / uncaught
// errors / unhandled rejections. Handy for MCP-driven checks and manual debugging.
export function installDevHelpers() {
	if (!import.meta.env.DEV) {
		return;
	}

	const errors: string[] = [];
	const record           = (label: string, value: unknown) => {
		const v = value as { stack?: string };
		errors.push(`${label}: ${v?.stack ?? String(value)}`);
	};

	const origError = console.error.bind(console);
	console.error   = (...args: unknown[]) => {
		record("console.error", args.map(a => (a as { stack?: string })?.stack ?? String(a)).join(" "));
		origError(...args);
	};
	window.addEventListener("error", e => record("error", e.error ?? e.message));
	window.addEventListener("unhandledrejection", e => record("unhandledrejection", e.reason));

	const w    = window as unknown as Record<string, unknown>;
	w.__errors = errors;
	w.__app    = {
		// navigate / open panels by URN or entity
		goToURN,
		openItemPanel,
		openSourceDetails,
		wailsDebug: {
			get enabled() {
				return localStorage.getItem('enable-wails-method-debug') === 'true';
			},
			toggle: () => {
				const newValue = localStorage.getItem('enable-wails-method-debug') !== 'true';
				localStorage.setItem('enable-wails-method-debug', String(newValue));
				console.info(`[dev] Wails method debug logging ${newValue ? 'enabled' : 'disabled'}.`);
			}
		},
		// live valtio stores (snapshot() them yourself for a full dump)
		stores : {sources, navigation, list},
		// lean, JSON-safe summary — avoids dumping the whole nav tree / entry list
		state       : () => {
			const nav = snapshot(navigation);
			const l   = snapshot(list) as unknown as { entries?: unknown[]; loading?: boolean };
			return {
				loadingSources : sources.loading,
				sourceKinds    : sources.wrappedSources?.map(s => s.kind),
				activePath     : nav.activePath,
				expandedPaths  : nav.expandedPaths,
				rootNodeCount  : nav.rootNodes?.length,
				listLoading    : l.loading,
				listCount      : l.entries?.length,
			};
		},
		clearErrors : () => {
			errors.length = 0;
		},
	};
	console.info("[dev] window.__app + window.__errors ready");
}
