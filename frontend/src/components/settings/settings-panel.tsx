import {IDockviewPanelProps} from "dockview-react";
import {useEffect, useState} from "react";
import {useSnapshot} from "valtio/react";
import {GetMarketRegion, GetPlayer, SetMarketRegion, SetPlayerMastery} from "@bindings/bdo-viewer/internal/config/config.ts";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {cn} from "@/lib/utils.ts";
import {fetchMarket, market, marketLoaded, marketStatus} from "@/lib/market-data.tsx";
import {DataExtractionSettings} from "@/components/setup/data-extraction-settings.tsx";
import {AboutSettings} from "@/components/updates/about-settings.tsx";

// The bdolytics central-market regions.
const REGIONS = ["NA", "EU", "SEA", "MENA", "KR", "RU", "JP", "TH", "TW", "SA", "GLOBAL", "CONSOLE_EU", "CONSOLE_NA", "CONSOLE_ASIA"];

// SettingsPanel edits the global player settings the crafting calculator reads:
// life-skill mastery (drives yield) and the central-market region + price load.
export function SettingsPanel(_props: IDockviewPanelProps) {
	const [cooking, setCooking]       = useState(0);
	const [alchemy, setAlchemy]       = useState(0);
	const [processing, setProcessing] = useState(0);
	const [region, setRegion]         = useState("NA");
	const [loaded, setLoaded]         = useState(false);

	const marketSnap = useSnapshot(market);

	useEffect(() => {
		let cancelled = false;
		void Promise.all([GetPlayer(), GetMarketRegion()]).then(([p, r]) => {
			if (cancelled) return;
			setCooking(p.cooking_mastery);
			setAlchemy(p.alchemy_mastery);
			setProcessing(p.processing_mastery);
			setRegion(r);
			setLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const saveMastery = (cook: number, alch: number, proc: number) => {
		setCooking(cook);
		setAlchemy(alch);
		setProcessing(proc);
		void SetPlayerMastery(cook, alch, proc);
	};

	const saveRegion = (r: string) => {
		setRegion(r);
		void SetMarketRegion(r);
	};

	if (!loaded) {
		return <div className={"p-4 text-sm text-zinc-400"}>Loading…</div>;
	}

	return (
		<div className={"flex flex-col gap-8 p-4 overflow-auto max-h-full"} data-panel={"settings"}>
			<section className={"flex flex-col gap-3"}>
				<h2 className={"text-sm font-semibold text-zinc-200"}>Life-Skill Mastery</h2>
				<p className={"text-xs text-zinc-400"}>
					Drives the crafting calculator's yield estimate (proc bonus reduces materials). Applied globally.
				</p>
				<MasteryInput label={"Cooking"} value={cooking} onChange={v => saveMastery(v, alchemy, processing)} />
				<MasteryInput label={"Alchemy"} value={alchemy} onChange={v => saveMastery(cooking, v, processing)} />
				<MasteryInput label={"Processing"} value={processing} onChange={v => saveMastery(cooking, alchemy, v)} />
			</section>

			<section className={"flex flex-col gap-3"}>
				<h2 className={"text-sm font-semibold text-zinc-200"}>Central Market</h2>
				<p className={"text-xs text-zinc-400"}>
					Live prices from bdolytics (server-side, optional). Used for the crafting shopping list.
				</p>
				<div className={"flex items-center gap-3"}>
					<Label className={"w-24 shrink-0 text-xs text-muted-foreground"}>Region</Label>
					<select
						value={region}
						onChange={e => saveRegion(e.target.value)}
						className={cn(
							"h-9 rounded-md border border-input bg-transparent dark:bg-input/30 px-2 text-sm text-zinc-300 outline-none cursor-pointer",
							"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-zinc-900",
						)}
					>
						{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
					</select>
				</div>
				<div className={"flex items-center gap-3"}>
					<Button size={"sm"} disabled={marketSnap.loading} onClick={() => void fetchMarket()}>
						{marketSnap.loading ? "Loading…" : marketLoaded() ? "Refresh Prices" : "Load Market Prices"}
					</Button>
					<span className={"text-xs text-zinc-400"}>{marketStatus()}</span>
				</div>
			</section>

			<DataExtractionSettings />

			<AboutSettings />
		</div>
	);
}

function MasteryInput({label, value, onChange}: { label: string, value: number, onChange: (v: number) => void }) {
	return (
		<div className={"flex items-center gap-3"}>
			<Label className={"w-24 shrink-0 text-xs text-muted-foreground"}>{label}</Label>
			<Input
				type={"number"}
				min={0}
				value={value}
				onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
				className={"w-32"}
			/>
		</div>
	);
}
