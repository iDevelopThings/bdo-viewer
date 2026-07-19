import {Label} from "@/components/ui/label.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {DirPicker} from "./dir-picker.tsx";
import type {UseGameInstall} from "@/state/game-install.ts";

// GameInstallFields is the shared body of the setup wizard and the settings panel: the
// game/data directory pickers, the game-dir validation status, and the language/region
// selects, all driven by a useGameInstall() instance.
export function GameInstallFields({
	install,
	disabled = false,
}: {
	install: UseGameInstall;
	disabled?: boolean;
}) {
	const {defaultDir, gameDir, setGameDir, dataDir, setDataDir, lang, setLang, languages, region, setRegion, regions} = install;
	const {validating, meta, validateError} = install;

	return (
		<>
			<DirPicker
				label={"Game install directory"}
				value={gameDir}
				onChange={setGameDir}
				title={"Select your Black Desert Online install folder"}
				placeholder={defaultDir}
				disabled={disabled}
			/>

			<div className={"min-h-5 text-xs"}>
				{validating && <span className={"text-fg-subtle"}>Checking…</span>}
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
				disabled={disabled}
			/>

			<div className={"flex flex-col gap-1.5"}>
				<Label className={"text-xs text-muted-foreground"}>Language</Label>
				<Select
					value={lang}
					onValueChange={v => setLang(v ?? "en")}
					disabled={disabled || languages.length === 0}
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
					onValueChange={v => setRegion(v ?? "")}
					disabled={disabled || regions.length === 0}
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
		</>
	);
}
