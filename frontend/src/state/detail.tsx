import {type PropsWithChildren, useContext, useEffect, useMemo} from "react";
import {useSnapshot} from "valtio/react";
import {DetailStore, getEntryKey, type PartialSourceEntry} from "@/state/detail-store.tsx";
import {persistSync} from "@/lib/persist-sync.ts";
import {Snapshot} from "valtio";
import {DetailContext} from "@/state/detail-context.ts";
import {isItem} from "@/state/sources/sources.ts";

export type DetailProviderProps = PropsWithChildren<{
	entry: PartialSourceEntry | undefined;
}>;

export function DetailProvider({entry, children}: DetailProviderProps) {
	const storageKey = entry ? `details-${entry.type}-${getEntryKey(entry)}` : "details";

	const persisted = useMemo(() => {
		return persistSync(new DetailStore(entry), storageKey, {
			debounceTime          : 500,
			mergeStrategy         : {
				isAsync : false,
				merge   : (initialState, restoredState) => {
					const result = Object.assign(initialState, restoredState);
					result.postLoad();
					return result;
				},
			},
			serializationStrategy : {
				isAsync : false,
				serialize(state: Snapshot<DetailStore>): string {
					if (!state) {
						return JSON.stringify({});
					}

					return JSON.stringify({
						entry         : {
							type  : state.entry?.type,
							value : getEntryKey(state.entry),
						},
						source        : state.source,
						_level        : state.level,
						_caphrasStep  : state.caphrasStep,
						scrollOffset  : state.scrollOffset,
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

	// Each navigation builds a new per-entry store; dispose the previous one so its
	// persistence subscription doesn't leak.
	useEffect(() => {
		return () => persisted.dispose();
	}, [persisted]);

	useEffect(() => {
		store?.initialize(entry);
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
