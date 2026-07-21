import {type PropsWithChildren, useContext, useEffect, useMemo} from "react";
import {useSnapshot} from "valtio/react";
import {DetailStore, type PartialSourceEntry} from "@/state/detail-store.tsx";
import {persistSync} from "@/lib/persist-sync.ts";
import type {Snapshot} from "valtio";
import {DetailContext} from "@/state/detail-context.ts";
import {isItem} from "@/state/sources/sources.ts";

export type DetailProviderProps = PropsWithChildren<{
	entry: PartialSourceEntry | undefined;
}>;

export function DetailProvider({entry, children}: DetailProviderProps) {
	const storageKey = entry ? `details-${entry.type}-${entry.urn}` : "details";

	const persisted = useMemo(() => {
		return persistSync(new DetailStore(entry), storageKey, {
			debounceTime          : 500,
			mergeStrategy         : {
				isAsync : false,
				// Only restore the persisted fields here. Hydration (initialize/load) must run on
				// the proxied store via the provider useEffect below — doing it here mutates the
				// pre-proxy object, so valtio never sees those writes and persistence stops firing.
				merge : (initialState, restoredState) => {
					return Object.assign(initialState, restoredState);
				},
			},
			serializationStrategy : {
				isAsync : false,
				serialize(state: Snapshot<DetailStore>): string {
					if (!state) {
						return JSON.stringify({});
					}

					return JSON.stringify({
						entry        : {
							type : state.entry?.type,
							urn  : state.entry?.urn,
						},
						source       : state.source,
						_level       : state.level,
						_caphrasStep : state.caphrasStep,
						scrollOffset : state.scrollOffset,
					});
				},
				deserialize(data: string): DetailStore {
					if (!data || data === "{}") {
						return {} as unknown as DetailStore;
					}
					return JSON.parse(data);
				}
			}
		});
	}, [entry, storageKey]);

	const store = persisted.store as DetailStore;

	// Bind persistence here (not eagerly in persistSync) so subscribe/unsubscribe stay symmetric:
	// a StrictMode remount re-subscribes, and navigating away unsubscribes so it doesn't leak.
	useEffect(() => {
		return persisted.subscribe();
	}, [persisted]);

	useEffect(() => {
		store.initialize(entry);
	}, [entry, store]);

	if (!store) {
		console.error("DetailProvider: store is null, this should not happen");
		return null; // or a skeleton/spinner
	}

	return (
		<DetailContext.Provider value={store}>
			{children}
		</DetailContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDetailStore() {
	const store = useContext(DetailContext);
	if (!store) throw new Error("useDetailStore must be used within DetailProvider");
	return store;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDetail() {
	const store = useContext(DetailContext);
	if (!store) throw new Error("useDetail must be used within DetailProvider");
	return [store, useSnapshot(store)] as const;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDetailItem() {
	const [store] = useDetail();
	if (!store.entry || !isItem(store.entry)) {
		throw new Error("useDetailItem must be used with an item entry");
	}
	return isItem(store.entry) ? store.entry.value : undefined;
}
