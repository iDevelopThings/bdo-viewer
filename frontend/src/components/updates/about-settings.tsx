import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {Check, CurrentVersion} from "@bindings/bdo-viewer/internal/updates/service.ts";

// AboutSettings shows the running version and a manual update check. The app also
// checks automatically on startup and on a timer; this is for on-demand checks.
export function AboutSettings() {
	const [version, setVersion] = useState("");
	const [checking, setChecking] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	useEffect(() => {
		void CurrentVersion().then(setVersion);
	}, []);

	const check = () => {
		setChecking(true);
		setResult(null);
		void Check()
			.then(release => {
				setResult(release ? `Version ${release.version} is available — see the banner to install.` : "You're on the latest version.");
			})
			.catch((err: unknown) => {
				setResult(err instanceof Error ? err.message : "Check failed.");
			})
			.finally(() => setChecking(false));
	};

	return (
		<section className={"flex flex-col gap-3"}>
			<h2 className={"text-sm font-semibold text-zinc-200"}>About</h2>
			<div className={"flex items-center gap-3"}>
				<span className={"text-xs text-zinc-400"}>Version {version || "…"}</span>
				<Button size={"sm"} variant={"outline"} disabled={checking} onClick={check}>
					{checking ? "Checking…" : "Check for updates"}
				</Button>
				{result && <span className={"text-xs text-zinc-400"}>{result}</span>}
			</div>
		</section>
	);
}
