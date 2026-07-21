import {goToURN, openItemPanel, openSourceDetails} from "@/state/panels.ts";
import {sources} from "@/state/sources/sources.ts";
import {navigation} from "@/state/navigation.tsx";
import {list} from "@/state/list.tsx";
import {snapshot} from "valtio/vanilla";
import {load} from "@/state/load.ts";
import {type GearBuilderStore, gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";

export interface DevHelpers {
	__logs?: string[];
	get errors(): string[];
	__app?: {
		goToURN: typeof goToURN;
		openItemPanel: typeof openItemPanel;
		openSourceDetails: typeof openSourceDetails;
		wailsDebug: {
			enabled: boolean;
			toggle: () => void;
		};
		stores: {
			sources: typeof sources;
			navigation: typeof navigation;
			list: typeof list;
			load: typeof load;
			gearBuilder: GearBuilderStore;
		};
		state: () => Record<string, unknown>;
		clearErrors: () => void;
		clearLogs: () => void;
	};
}

// installDevHelpers wires debugging conveniences onto window in DEV builds only
// (a no-op in production): `window.__app` to navigate by URN and inspect live
// state, and `window.__errors` as a rolling buffer of console.error / uncaught
// errors / unhandled rejections. Handy for MCP-driven checks and manual debugging.
export function installDevHelpers() {
	if (!import.meta.env.DEV) {
		return;
	}

	let logs: string[] = [];

	const record = (label: string, value: unknown) => {
		const v = value as { stack?: string };
		logs.push(`${label}: ${v.stack ?? String(value)}`);
	};

	const origError = console.error.bind(console);
	console.error   = (...args: unknown[]) => {
		record("console.error", args.map(a => (a as { stack?: string }).stack ?? String(a)).join(" "));
		origError(...args);
	};
	const origLog   = console.log.bind(console);
	console.log     = (...args: unknown[]) => {
		record("console.log", args.map(a => (a as { stack?: string }).stack ?? String(a)).join(" "));
		origLog(...args);
	};
	const origDebug = console.debug.bind(console);
	console.debug   = (...args: unknown[]) => {
		record("console.debug", args.map(a => (a as { stack?: string }).stack ?? String(a)).join(" "));
		origDebug(...args);
	};
	const origInfo  = console.info.bind(console);
	console.info    = (...args: unknown[]) => {
		record("console.info", args.map(a => (a as { stack?: string }).stack ?? String(a)).join(" "));
		origInfo(...args);
	};
	const origWarn  = console.warn.bind(console);
	console.warn    = (...args: unknown[]) => {
		record("console.warn", args.map(a => (a as { stack?: string }).stack ?? String(a)).join(" "));
		origWarn(...args);
	};


	window.addEventListener("error", e => record("error", e.error ?? e.message));
	window.addEventListener("unhandledrejection", e => record("unhandledrejection", e.reason));

	window.__logs = logs;
	Object.defineProperty(window, "__errors", {
		get : () => logs.filter(l => l.startsWith("console.error") || l.startsWith("error") || l.startsWith("unhandledrejection")),
	});

	window.__app = {
		// navigate / open panels by URN or entity
		goToURN,
		openItemPanel,
		openSourceDetails,
		wailsDebug : {
			get enabled() {
				return localStorage.getItem("enable-wails-method-debug") === "true";
			},
			toggle : () => {
				const newValue = localStorage.getItem("enable-wails-method-debug") !== "true";
				localStorage.setItem("enable-wails-method-debug", String(newValue));
				console.info(`[dev] Wails method debug logging ${newValue ? "enabled" : "disabled"}.`);
			}
		},
		// live valtio stores (snapshot() them yourself for a full dump)
		stores : {sources, navigation, list, load, gearBuilder : gearBuilderStore},
		// lean, JSON-safe summary — avoids dumping the whole nav tree / entry list
		state       : () => {
			const nav = snapshot(navigation);
			const l   = snapshot(list) as unknown as { entries?: unknown[]; loading?: boolean };
			return {
				loadingSources : sources.loading,
				sourceKinds    : sources.wrappedSources.map(s => s.kind),
				activePath     : nav.activePath,
				expandedPaths  : nav.expandedPaths,
				rootNodeCount  : nav.rootNodes.length,
				listLoading    : l.loading,
				listCount      : l.entries?.length,
			};
		},
		clearLogs   : () => {
			logs.length = 0;
		},
		clearErrors : () => {
			logs = logs.filter(l => !l.startsWith("console.error") && !l.startsWith("error") && !l.startsWith("unhandledrejection"));
		},
	};

	console.info("[dev] window.__app + window.__errors ready");
}
