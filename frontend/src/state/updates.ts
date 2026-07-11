import {useCallback, useEffect, useState} from "react";
import {Events} from "@wailsio/runtime";
import {Check, DownloadAndInstall, Restart} from "@bindings/bdo-viewer/internal/updates/service.ts";
import type {Release} from "@bindings/github.com/wailsapp/wails/v3/pkg/updater/models.ts";

export type UpdateStatus = "idle" | "available" | "downloading" | "ready" | "error";

interface DownloadProgress {
	written: number;
	total: number;
}

export interface UpdateState {
	status: UpdateStatus;
	release: Release | null;
	progress: DownloadProgress;
	error: string | null;
}

const initial: UpdateState = {
	status: "idle",
	release: null,
	progress: {written: 0, total: 0},
	error: null,
};

// useUpdates checks for a newer release on mount and drives the download/install
// flow, reflecting the framework's wails:updater:* events.
export function useUpdates() {
	const [state, setState] = useState<UpdateState>(initial);

	useEffect(() => {
		const offProgress = Events.On("wails:updater:download-progress", (e: {data: DownloadProgress}) => {
			setState(s => ({...s, status: "downloading", progress: e.data}));
		});
		const offReady = Events.On("wails:updater:update-ready", () => {
			setState(s => ({...s, status: "ready"}));
		});
		const offError = Events.On("wails:updater:error", (e: {data?: {message?: string}}) => {
			setState(s => ({...s, status: "error", error: e.data?.message ?? "Update failed"}));
		});

		// Automatic check on startup; the framework's CheckInterval polls thereafter.
		void Check().then(release => {
			if (release) {
				setState(s => ({...s, status: "available", release}));
			}
		}).catch(() => {
			// A failed check (offline, rate-limited) just means "no banner"; ignore.
		});

		return () => {
			offProgress();
			offReady();
			offError();
		};
	}, []);

	const install = useCallback(() => {
		setState(s => ({...s, status: "downloading", error: null}));
		void DownloadAndInstall().catch((err: unknown) => {
			setState(s => ({...s, status: "error", error: err instanceof Error ? err.message : String(err)}));
		});
	}, []);

	const restart = useCallback(() => {
		void Restart();
	}, []);

	const dismiss = useCallback(() => {
		setState(initial);
	}, []);

	return {state, install, restart, dismiss};
}
