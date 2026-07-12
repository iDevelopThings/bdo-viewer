import {proxy} from "valtio";
import {Events} from "@wailsio/runtime";
import {ForceLoadData, LoadData} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {loadSources} from "@/state/sources/sources.ts";
import type {Progress} from "@bindings/bdo-viewer/internal/event_reporter/models.ts";

export type LoadPhase = "loading" | "ready" | "error";

// LoadView is the read side (what a useSnapshot(load) exposes) — the fields the load
// screen renders, nothing else.
export interface LoadView {
	readonly phase: LoadPhase;
	readonly stage: string;
	readonly done: number;
	readonly total: number;
	readonly log: readonly string[];
	readonly error: string | null;
}

const MAX_LOG_LINES = 200;

function errMessage(e: unknown): string {
	if (e instanceof Error) {
		return e.message;
	}
	return typeof e === "string" ? e : "Failed to load data";
}

// LoadController brings the app online in one place: it loads the extracted dataset
// into the backend's memory (await LoadData / ForceLoadData, streaming load:progress)
// and then pulls it into the frontend (loadSources). One shared instance drives one
// load screen — components read it via useSnapshot(load) and drive it with
// load.ensure() / load.reload(). Transient, so it is proxied but not persisted.
export class LoadController {
	public phase: LoadPhase      = "loading";
	public stage: string         = "";
	public done: number          = 0;
	public total: number         = 0;
	public log: string[]         = [];
	public error: string | null  = null;

	// bumped per run so a superseded run (a StrictMode remount, a re-trigger) bails
	// out before it clobbers the current run's result.
	private token: number = 0;

	// ensure loads the data once. Idempotent — the backend no-ops if it's already in
	// memory — so it's safe to call on every mount (React StrictMode, an F5 reload).
	public ensure(): Promise<void> {
		return this.run(false);
	}

	// reload forces a fresh load from disk even when the data is already in memory:
	// a settings re-extract, or an explicit "reload".
	public reload(): Promise<void> {
		return this.run(true);
	}

	// applyProgress folds one backend load:progress tick into the visible state. It
	// never touches phase — only a run() started here drives the screen, so an
	// out-of-band backend load doesn't yank the app into a loading screen.
	public applyProgress(p: Progress): void {
		if (p.total > 0) {
			this.done  = p.done;
			this.total = p.total;
		}
		if (p.phase) {
			this.stage = p.phase;
		}
		if (p.log) {
			this.log.push(p.log);
			if (this.log.length > MAX_LOG_LINES) {
				this.log.splice(0, this.log.length - MAX_LOG_LINES);
			}
		}
	}

	private async run(force: boolean): Promise<void> {
		const token = ++this.token;
		this.phase = "loading";
		this.stage = "";
		this.done  = 0;
		this.total = 0;
		this.log   = [];
		this.error = null;

		try {
			await (force ? ForceLoadData() : LoadData());
			if (token !== this.token) {
				return;
			}
			await loadSources();
			if (token !== this.token) {
				return;
			}
			this.phase = "ready";
		} catch (e) {
			if (token === this.token) {
				this.phase = "error";
				this.error = errMessage(e);
			}
		}
	}
}

export const load = proxy(new LoadController());

// Backend progress → store. Registered once at module load and dispatched through the
// proxy so valtio tracks the mutations.
Events.On("load:progress", (e: {data: Progress}) => load.applyProgress(e.data));
