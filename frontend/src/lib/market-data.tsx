import {proxy} from "valtio";
import {useSnapshot} from "valtio/react";
import {proxyMap} from "valtio/utils";
import {moneyLabel} from "@/utils.tsx";
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

export function marketLoaded(): boolean {
	return market.fetched !== undefined;
}

// marketPrice returns the live listing for an item urn, or undefined when it isn't
// listed / prices aren't loaded.
export function marketPrice(urn: string): MarketEntry | undefined {
	return market.byURN.get(urn);
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

export function marketPriceLabel(urn: string): string | undefined {
	if (!market.fetched || market.loading) {
		return "loading…";
	}
	const e = marketPrice(urn);
	return e ? moneyLabel(e.price) : undefined;
}

// useMarketPriceLabel reads the live price label for an item urn via useSnapshot(),
// re-rendering when prices load. It does not trigger a fetch: prices are loaded once
// at startup (see layout) and refreshed explicitly (settings / calc).
export function useMarketPriceLabel(urn: string | undefined): string | undefined {
	const {fetched, loading, byURN} = useSnapshot(market);

	if (urn === undefined) {
		return undefined;
	}
	if (!fetched || loading) {
		return "loading…";
	}
	const e = byURN.get(urn);
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
