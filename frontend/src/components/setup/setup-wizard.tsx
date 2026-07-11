import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {cn} from "@/lib/utils.ts";
import {DirPicker} from "./dir-picker.tsx";
import {ExtractionProgress} from "./extraction-progress.tsx";
import {useExtraction} from "@/state/extraction.ts";
import {
	AvailableLanguages,
	DefaultDataDir,
	DefaultGameDir,
	ValidateGameDir,
} from "@bindings/bdo-viewer/internal/setup/service.ts";
import type {Meta} from "@bindings/github.com/idevelopthings/bdo-data-extractor/pipeline/models.ts";

const selectClass = cn(
	"h-9 rounded-md border border-input bg-transparent dark:bg-input/30 px-2 text-sm text-zinc-300 outline-none cursor-pointer",
	"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-zinc-900",
);

// SetupWizard is the first-boot screen: the user points at their BDO install,
// optionally moves the output dir and picks a language, then runs extraction.
export function SetupWizard({onComplete}: {onComplete: () => void}) {
	const [gameDir, setGameDir]   = useState("");
	const [dataDir, setDataDir]   = useState("");
	const [lang, setLang]         = useState("en");
	const [meta, setMeta]         = useState<Meta | null>(null);
	const [languages, setLanguages] = useState<string[]>([]);
	const [validating, setValidating] = useState(false);
	const [validateError, setValidateError] = useState<string | null>(null);

	const {state, run, reset, fraction} = useExtraction(onComplete);

	useEffect(() => {
		void Promise.all([DefaultGameDir(), DefaultDataDir()]).then(([g, d]) => {
			setGameDir(g);
			setDataDir(d);
		});
	}, []);

	// Validate the game dir (debounced) whenever it changes, pulling its meta
	// summary and the languages actually present in that install.
	useEffect(() => {
		if (!gameDir) {
			setMeta(null);
			setValidateError(null);
			return;
		}
		let cancelled = false;
		setValidating(true);
		const timer = setTimeout(() => {
			void Promise.all([ValidateGameDir(gameDir), AvailableLanguages(gameDir)])
				.then(([m, langs]) => {
					if (cancelled) {
						return;
					}
					setMeta(m);
					setValidateError(null);
					const list = langs ?? [];
					setLanguages(list);
					setLang(prev => (list.includes(prev) ? prev : (list.includes("en") ? "en" : list[0] ?? prev)));
				})
				.catch((err: unknown) => {
					if (cancelled) {
						return;
					}
					setMeta(null);
					setLanguages([]);
					setValidateError(err instanceof Error ? err.message : String(err));
				})
				.finally(() => {
					if (!cancelled) {
						setValidating(false);
					}
				});
		}, 500);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [gameDir]);

	const extracting = state.status === "running" || state.status === "done";

	return (
		<div className={"flex h-full w-full items-center justify-center overflow-auto bg-zinc-950 p-6"}>
			<div className={"flex w-full max-w-lg flex-col gap-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl"}>
				<div className={"flex flex-col gap-1"}>
					<h1 className={"text-lg font-semibold text-zinc-100"}>Welcome to BDO Viewer</h1>
					<p className={"text-sm text-zinc-400"}>
						Point the viewer at your Black Desert Online install so it can extract the game
						data. This runs once — after it finishes the app opens normally.
					</p>
				</div>

				{!extracting && (
					<>
						<DirPicker
							label={"Game install directory"}
							value={gameDir}
							onChange={setGameDir}
							title={"Select your Black Desert Online install folder"}
							placeholder={"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Black Desert Online"}
						/>

						<div className={"min-h-5 text-xs"}>
							{validating && <span className={"text-zinc-500"}>Checking…</span>}
							{!validating && meta && (
								<span className={"text-emerald-400"}>
									Valid install — version {meta.version}, {meta.files.toLocaleString()} files.
								</span>
							)}
							{!validating && validateError && (
								<span className={"text-red-400"}>
									Not a valid BDO install (no Paz/pad00000.meta found here).
								</span>
							)}
						</div>

						<DirPicker
							label={"Extracted data location"}
							value={dataDir}
							onChange={setDataDir}
							title={"Choose where to store extracted data"}
						/>

						<div className={"flex flex-col gap-1.5"}>
							<Label className={"text-xs text-muted-foreground"}>Language</Label>
							<select
								value={lang}
								onChange={e => setLang(e.target.value)}
								disabled={languages.length === 0}
								className={selectClass}
							>
								{(languages.length ? languages : [lang]).map(l => (
									<option key={l} value={l}>{l}</option>
								))}
							</select>
						</div>

						<Button
							disabled={!meta || validating || !dataDir}
							onClick={() => run(gameDir, dataDir, lang)}
						>
							Extract game data
						</Button>
					</>
				)}

				{extracting && (
					<>
						<ExtractionProgress state={state} fraction={fraction} />
						{state.status === "error" && (
							<div className={"flex flex-col gap-3"}>
								<p className={"text-sm text-red-400"}>Extraction failed: {state.error}</p>
								<Button variant={"outline"} onClick={reset}>Back</Button>
							</div>
						)}
						{state.status === "done" && (
							<p className={"text-sm text-emerald-400"}>Done — loading…</p>
						)}
					</>
				)}
			</div>
		</div>
	);
}
