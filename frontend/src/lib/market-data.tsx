import {proxy} from "valtio";
import {useSnapshot} from "valtio/react";
import {proxyMap} from "valtio/utils";
import {useEffect} from "react";
import {moneyLabel} from "@/utils.tsx";
import {ItemURN} from "@/lib/urn.ts";
import {Fetch as FetchMarket, Snapshot} from "@bindings/bdo-viewer/internal/market/service.ts";
import type {Entry, Status} from "@bindings/bdo-viewer/internal/market";
import {GetMarketRegion} from "@bindings/bdo-viewer/internal/config/config.ts";

// Live central-market prices — the one piece of data not in the client (the
// market economy is server-side and live). The fetch is done server-side by the
// Go market service (internal/market), so there's no CORS wrangling; this module
// is a thin client-side read cache over it. Prices are an optional runtime
// overlay: never persisted, and the extractor's cached data stays client-sourced.

export type MarketEntry = Entry;

type MarketState = {
	byURN: Map<string, MarketEntry>;
	region: string;
	fetched: string | undefined;
	loading: boolean;
	error: string | undefined;
};

export const market = proxy<MarketState>({
	byURN   : proxyMap<string, MarketEntry>(),
	region  : "NA",
	fetched : undefined,
	loading : false,
	error   : undefined,
});

function applyStatus(s: Status) {
	market.region  = s.region;
	market.loading = s.loading;
	market.error   = s.error || undefined;
	market.fetched = s.fetched || undefined;
}

// toURN accepts an item URN string or a numeric id (many call sites still carry
// plain ids) and normalises to the item URN the price map is keyed by.
function toURN(idOrURN: number | string): string {
	if (typeof idOrURN === "string" && idOrURN.startsWith("urn::")) {
		return idOrURN;
	}
	return ItemURN.new(idOrURN);
}

export function marketLoaded(): boolean {
	return market.fetched !== undefined;
}

// marketPrice returns the live listing for an item (URN or id), or undefined when
// it isn't listed / prices aren't loaded.
export function marketPrice(idOrURN: number | string): MarketEntry | undefined {
	return market.byURN.get(toURN(idOrURN));
}

// fetchMarket loads the central-market snapshot for the configured region through
// the Go service, then mirrors the price map into the client cache.
export async function fetchMarket() {
	if (market.loading) {
		return;
	}
	market.loading = true;
	market.error   = undefined;

	try {
		const region = await GetMarketRegion();
		const status = await FetchMarket(region);
		applyStatus(status);
		if (!status.error) {
			const snap = await Snapshot();
			const next = proxyMap<string, MarketEntry>();
			for (const [urn, entry] of Object.entries(snap ?? {})) {
				if (entry) {
					next.set(urn, entry);
				}
			}
			market.byURN = next;
		}
	} catch (error) {
		market.error = error instanceof Error ? error.message : String(error);
	} finally {
		market.loading = false;
	}
}

export function marketPriceLabel(idOrURN: number | string): string | undefined {
	if (!market.fetched) {
		void fetchMarket();
		return "loading…";
	}
	if (market.loading) {
		return "loading…";
	}
	const e = marketPrice(idOrURN);
	return e ? moneyLabel(e.price) : undefined;
}

// useMarketPriceLabel reads through useSnapshot() so it re-renders on load, and
// triggers a fetch on first use.
export function useMarketPriceLabel(idOrURN: number | string | undefined): string | undefined {
	const snap = useSnapshot(market);

	useEffect(() => {
		if (idOrURN !== undefined && !snap.fetched && !snap.loading) {
			void fetchMarket();
		}
	}, [idOrURN, snap.fetched, snap.loading]);

	if (idOrURN === undefined) {
		return undefined;
	}
	if (!snap.fetched || snap.loading) {
		return "loading…";
	}
	const e = snap.byURN.get(toURN(idOrURN));
	return e ? moneyLabel(e.price) : undefined;
}

export function marketStatus(): string {
	if (market.loading) {
		return "loading…";
	}
	if (market.error) {
		return "error: " + market.error;
	}
	if (market.fetched) {
		const time = new Date(market.fetched).toLocaleTimeString(undefined, {hour : "2-digit", minute : "2-digit"});
		return `${market.byURN.size} prices · ${market.region} · ${time}`;
	}
	return "";
}

// marketMenuLabel is the load-button text, reflecting the current state.
export function marketMenuLabel(): string {
	if (market.loading) {
		return "Market Prices: loading…";
	}
	if (marketLoaded()) {
		return "Market Prices: refresh · " + marketStatus();
	}
	return "Load Market Prices (bdolytics)";
}
