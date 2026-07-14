import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {DirPicker} from "./dir-picker.tsx";
import {ExtractionProgress} from "./extraction-progress.tsx";
import {useExtraction} from "@/state/extraction.ts";
import {load} from "@/state/load.ts";
import {AvailableLanguages, AvailableRegions, ValidateGameDir} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {GetDataRegion, GetExtractedDataDir, GetGameDir, SetDataRegion, SetExtractedDataDir, SetGameDir} from "@bindings/bdo-viewer/internal/config/config.ts";

// DataExtractionSettings lets the user change the game/data directories after
// first run and re-extract on demand. Re-extraction reloads the in-memory
// dataset when it finishes.
export function DataExtractionSettings() {
	const [gameDir, setGameDir] = useState("");
	const [dataDir, setDataDir] = useState("");
	const [lang, setLang]       = useState("en");
	const [languages, setLanguages] = useState<string[]>([]);
	const [region, setRegion]   = useState("");
	const [regions, setRegions] = useState<string[]>([]);
	const [valid, setValid]     = useState(false);

	// Re-extraction only rewrites the JSON on disk. Route the reload through the load
	// store so it flows through the same load screen (and refreshes the frontend) as a
	// normal startup load.
	//
	// Then reload the page: module-level caches built from the old dataset (the world
	// map's graph and tiles among them) survive load.reload() and would go on serving
	// the previous data. Only on success — a failed load keeps its error on screen.
	const {state, run, reset, fraction} = useExtraction(() => {
		void load.reload().then(() => {
			if (load.phase === "ready") {
				window.location.reload();
			}
		});
	});

	useEffect(() => {
		void Promise.all([GetGameDir(), GetExtractedDataDir(), GetDataRegion()]).then(([g, d, r]) => {
			setGameDir(g);
			setDataDir(d);
			setRegion(r);
		});
	}, []);

	useEffect(() => {
		if (!gameDir) {
			setValid(false);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			void Promise.all([ValidateGameDir(gameDir), AvailableLanguages(gameDir), AvailableRegions(gameDir)])
				.then(([, langs, regs]) => {
					if (cancelled) {
						return;
					}
					setValid(true);
					const list = langs ?? [];
					setLanguages(list);
					setLang(prev => (list.includes(prev) ? prev : (list.includes("en") ? "en" : list[0] ?? prev)));
					setRegions(regs ?? []);
				})
				.catch(() => {
					if (!cancelled) {
						setValid(false);
						setLanguages([]);
						setRegions([]);
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
	const onRegion = (v: string) => {
		setRegion(v);
		void SetDataRegion(v);
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
				<Select
					value={lang}
					onValueChange={v => setLang(v ?? "en")}
					disabled={running || languages.length === 0}
				>
					<SelectTrigger size={"sm"} className={"w-full"}>
						<SelectValue placeholder={"Language"} />
					</SelectTrigger>
					<SelectContent>
						{(languages.length ? languages : [lang]).map(l => (
							<SelectItem key={l} value={l}>{l}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className={"flex flex-col gap-1.5"}>
				<Label className={"text-xs text-muted-foreground"}>Server region</Label>
				<Select
					value={region || null}
					onValueChange={v => onRegion(v ?? "")}
					disabled={running || regions.length === 0}
				>
					<SelectTrigger size={"sm"} className={"w-full"}>
						<SelectValue placeholder={"Same as language"} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={null}>Same as language</SelectItem>
						{regions.map(r => (
							<SelectItem key={r} value={r}>{r}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className={"flex items-center gap-3"}>
				<Button
					size={"sm"}
					disabled={!valid || running || !dataDir}
					onClick={() => run(gameDir, dataDir, lang, region)}
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
