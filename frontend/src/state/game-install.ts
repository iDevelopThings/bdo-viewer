import {useState} from "react";
import {useAsync} from "react-async-hook";
import useConstant from "use-constant";
import AwesomeDebouncePromise from "awesome-debounce-promise";
import {GetSetupConfig, ValidateGameInstall} from "@bindings/bdo-viewer/internal/setup/service.ts";
import {SetDataRegion, SetExtractedDataDir, SetGameDir} from "@bindings/bdo-viewer/internal/config/config.ts";
import type {Meta} from "@bindings/github.com/idevelopthings/bdo-data-extractor/pipeline/models.ts";

export interface UseGameInstall {
	defaultDir: string;
	gameDir: string;
	setGameDir: (v: string) => void;
	dataDir: string;
	setDataDir: (v: string) => void;
	lang: string;
	setLang: (v: string) => void;
	languages: string[];
	region: string;
	setRegion: (v: string) => void;
	regions: string[];
	validating: boolean;
	meta: Meta | null;
	validateError: string | null;
	valid: boolean;
}

// useGameInstall owns the shared "point at a BDO install" form for both the first-run
// wizard and the settings panel: the dirs + language/region plus debounced validation of
// the game dir. Dir/region edits persist to config immediately; the language is an
// extraction parameter, so it's only handed to RunExtraction by the caller.
export function useGameInstall(): UseGameInstall {
	const [defaultDir, setDefaultDir] = useState("");
	const [gameDir, setGameDirState]  = useState("");
	const [dataDir, setDataDirState]  = useState("");
	const [region, setRegionState]    = useState("");
	const [lang, setLang]             = useState("en");

	// Seed from saved config (or first-run defaults). The fields stay editable, so copy
	// into local state via onSuccess rather than rendering the async result directly.
	useAsync(GetSetupConfig, [], {
		onSuccess: cfg => {
			setDefaultDir(cfg.defaultDir);
			setGameDirState(cfg.gameDir);
			setDataDirState(cfg.dataDir);
			setRegionState(cfg.region);
		},
	});

	// Debounce collapses typing bursts; useAsync ignores stale responses. Returning null
	// for an empty dir leaves `valid` false without a synchronous reset in an effect.
	const debouncedValidate = useConstant(() => AwesomeDebouncePromise(ValidateGameInstall, 500));
	const validation = useAsync(
		async () => {
			if (!gameDir) {
				return null;
			}
			return debouncedValidate(gameDir);
		},
		[gameDir, debouncedValidate],
		{
			onSuccess: info => {
				const list = info?.languages ?? [];
				// Keep the user's language if the install still ships it; else prefer en, then first.
				setLang(prev => (list.includes(prev) ? prev : (list.includes("en") ? "en" : list[0] ?? prev)));
			},
		},
	);

	const info  = validation.result ?? null;
	const error = validation.error;

	return {
		defaultDir,
		gameDir,
		setGameDir: v => {
			setGameDirState(v);
			void SetGameDir(v);
		},
		dataDir,
		setDataDir: v => {
			setDataDirState(v);
			void SetExtractedDataDir(v);
		},
		lang,
		setLang,
		languages: info?.languages ?? [],
		region,
		setRegion: v => {
			setRegionState(v);
			void SetDataRegion(v);
		},
		regions: info?.regions ?? [],
		validating: validation.loading,
		meta: info?.meta ?? null,
		validateError: error ? (error instanceof Error ? error.message : String(error)) : null,
		valid: !!info?.meta,
	};
}
