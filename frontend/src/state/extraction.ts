import {useCallback, useEffect, useRef, useState} from "react";
import {Events} from "@wailsio/runtime";
import {RunExtraction} from "@bindings/bdo-viewer/internal/setup/service.ts";
import type {Progress} from "@bindings/bdo-viewer/internal/setup/models.ts";

export type ExtractionStatus = "idle" | "running" | "done" | "error";

export interface ExtractionState {
	status: ExtractionStatus;
	step: number;   // 1..steps (current top-level command)
	steps: number;  // total top-level commands
	phase: string;  // current sub-stage label
	done: number;   // per-item progress within the current stage
	total: number;  // 0 when the current stage reports no per-item count
	log: string[];
	error: string | null;
}

const initial: ExtractionState = {
	status: "idle",
	step: 0,
	steps: 5,
	phase: "",
	done: 0,
	total: 0,
	log: [],
	error: null,
};

const MAX_LOG_LINES = 200;

// useExtraction subscribes to the setup:* event stream and exposes a run() that
// kicks off extraction. Shared by the first-boot wizard and the settings re-extract.
export function useExtraction(onDone?: () => void) {
	const [state, setState] = useState<ExtractionState>(initial);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	useEffect(() => {
		const offProgress = Events.On("setup:progress", (e: {data: Progress}) => {
			const p = e.data;
			setState(s => {
				const stepChanged = p.step !== 0 && p.step !== s.step;
				// done/total only carry meaning on per-item stages (total > 0); on
				// phase/log ticks they're 0, so keep the current bar unless the step
				// itself advanced (then reset the sub-bar).
				const hasCount = p.total > 0;
				return {
					...s,
					step: p.step || s.step,
					steps: p.steps || s.steps,
					phase: p.phase || s.phase,
					done: hasCount ? p.done : (stepChanged ? 0 : s.done),
					total: hasCount ? p.total : (stepChanged ? 0 : s.total),
					log: p.log ? [...s.log, p.log].slice(-MAX_LOG_LINES) : s.log,
				};
			});
		});
		const offDone = Events.On("setup:done", () => {
			setState(s => ({...s, status: "done"}));
			onDoneRef.current?.();
		});
		const offError = Events.On("setup:error", (e: {data?: {message?: string}}) => {
			setState(s => ({...s, status: "error", error: e.data?.message ?? "Extraction failed"}));
		});
		return () => {
			offProgress();
			offDone();
			offError();
		};
	}, []);

	const run = useCallback((gameDir: string, dataDir: string, lang: string) => {
		setState({...initial, status: "running"});
		void RunExtraction(gameDir, dataDir, lang);
	}, []);

	const reset = useCallback(() => setState(initial), []);

	// Overall fraction: completed steps plus the in-progress step's sub-fraction.
	const fraction = state.steps > 0
		? Math.min(1, ((Math.max(0, state.step - 1)) + (state.total > 0 ? state.done / state.total : 0)) / state.steps)
		: 0;

	return {state, run, reset, fraction};
}
