import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {cn} from "@/lib/utils.ts";
import {DirPicker} from "./dir-picker.tsx";
import {ExtractionProgress} from "./extraction-progress.tsx";
import {useExtraction} from "@/state/extraction.ts";
import {loadSources} from "@/state/sources/sources.ts";
import {AvailableLanguages, ValidateGameDir} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {GetExtractedDataDir, GetGameDir, SetExtractedDataDir, SetGameDir} from "@bindings/bdo-viewer/internal/config/config.ts";

const selectClass = cn(
	"h-9 rounded-md border border-input bg-transparent dark:bg-input/30 px-2 text-sm text-zinc-300 outline-none cursor-pointer",
	"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-zinc-900",
);

// DataExtractionSettings lets the user change the game/data directories after
// first run and re-extract on demand. Re-extraction reloads the in-memory
// dataset when it finishes.
export function DataExtractionSettings() {
	const [gameDir, setGameDir] = useState("");
	const [dataDir, setDataDir] = useState("");
	const [lang, setLang]       = useState("en");
	const [languages, setLanguages] = useState<string[]>([]);
	const [valid, setValid]     = useState(false);

	const {state, run, reset, fraction} = useExtraction(() => {
		void loadSources();
	});

	useEffect(() => {
		void Promise.all([GetGameDir(), GetExtractedDataDir()]).then(([g, d]) => {
			setGameDir(g);
			setDataDir(d);
		});
	}, []);

	useEffect(() => {
		if (!gameDir) {
			setValid(false);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			void Promise.all([ValidateGameDir(gameDir), AvailableLanguages(gameDir)])
				.then(([, langs]) => {
					if (cancelled) {
						return;
					}
					setValid(true);
					const list = langs ?? [];
					setLanguages(list);
					setLang(prev => (list.includes(prev) ? prev : (list.includes("en") ? "en" : list[0] ?? prev)));
				})
				.catch(() => {
					if (!cancelled) {
						setValid(false);
						setLanguages([]);
					}
				});
		}, 500);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [gameDir]);

	const onGameDir = (v: string) => {
		setGameDir(v);
		void SetGameDir(v);
	};
	const onDataDir = (v: string) => {
		setDataDir(v);
		void SetExtractedDataDir(v);
	};

	const running = state.status === "running";

	return (
		<section className={"flex flex-col gap-3"}>
			<h2 className={"text-sm font-semibold text-zinc-200"}>Data & Extraction</h2>
			<p className={"text-xs text-zinc-400"}>
				Where the game is installed and where extracted data lives. Re-extract after a
				game patch to refresh the data.
			</p>

			<DirPicker
				label={"Game install directory"}
				value={gameDir}
				onChange={onGameDir}
				title={"Select your Black Desert Online install folder"}
				disabled={running}
			/>
			<DirPicker
				label={"Extracted data location"}
				value={dataDir}
				onChange={onDataDir}
				title={"Choose where to store extracted data"}
				disabled={running}
			/>

			<div className={"flex flex-col gap-1.5"}>
				<Label className={"text-xs text-muted-foreground"}>Language</Label>
				<select
					value={lang}
					onChange={e => setLang(e.target.value)}
					disabled={running || languages.length === 0}
					className={selectClass}
				>
					{(languages.length ? languages : [lang]).map(l => (
						<option key={l} value={l}>{l}</option>
					))}
				</select>
			</div>

			<div className={"flex items-center gap-3"}>
				<Button
					size={"sm"}
					disabled={!valid || running || !dataDir}
					onClick={() => run(gameDir, dataDir, lang)}
				>
					{running ? "Extracting…" : "Re-extract data"}
				</Button>
				{state.status === "done" && <span className={"text-xs text-emerald-400"}>Done — reloaded.</span>}
				{state.status === "error" && (
					<span className={"text-xs text-red-400"}>Failed: {state.error}</span>
				)}
			</div>

			{(running || state.status === "done" || state.status === "error") && (
				<div className={"mt-1"}>
					<ExtractionProgress state={state} fraction={fraction} />
					{state.status === "error" && (
						<Button className={"mt-2"} size={"sm"} variant={"outline"} onClick={reset}>Dismiss</Button>
					)}
				</div>
			)}
		</section>
	);
}
