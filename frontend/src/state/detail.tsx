import {type PropsWithChildren, useContext, useEffect, useMemo} from "react";
import {useSnapshot} from "valtio/react";
import {isItem} from "@/state/sources/item-source.tsx";
import {DetailStore, getEntryKey, type PartialSourceEntry} from "@/state/detail-store.tsx";
import {persistSync} from "@/lib/persist-sync.ts";
import {Snapshot} from "valtio";
import {DetailContext} from "@/state/detail-context.ts";

export type DetailProviderProps = PropsWithChildren<{
	entry: PartialSourceEntry | undefined;
}>;

export function DetailProvider({entry, children}: DetailProviderProps) {
	const storageKey = entry ? `details-${entry.type}-${getEntryKey(entry)}` : "details";

	const store = useMemo(() => {
		const result = persistSync(new DetailStore(entry), storageKey, {
			debounceTime          : 500,
			mergeStrategy         : {
				isAsync : false,
				merge   : (initialState, restoredState) => {
					const result = Object.assign(initialState, restoredState);
					result.postLoad();
					// console.log("merge -> ", result);
					// console.log("merge -> initialState", initialState);
					// console.log("merge -> restoredState", restoredState);
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
						entry        : {
							type  : state.entry?.type,
							value : getEntryKey(state.entry),
						},
						source       : state.source,
						_level       : state.level,
						scrollOffset : state.scrollOffset,
					});

				},
				deserialize(data: string): DetailStore {
					if (!data || data === "{}") {
						return {} as unknown as DetailStore;
					}
					// console.log("DetailProvider: deserialized store", parsed, storageKey);
					return JSON.parse(data);
				}
			}
		});

//		console.log("DetailProvider: store initialized", result.store, storageKey);

		return result.store as DetailStore;
	}, [storageKey]);


	useEffect(() => {
//		console.log("DetailProvider: entry changed, re-initializing store", entry);
		store?.initialize(entry);
	}, [entry, storageKey]);

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

export function useDetail() {
	const store = useContext(DetailContext);
	if (!store) throw new Error("useDetail must be used within DetailProvider");
	return [store, useSnapshot(store)] as const;
}

export function useDetailItem() {
	const [store, snapshot] = useDetail();
	if (!store.entry || !isItem(store.entry)) {
		throw new Error("useDetailItem must be used with an item entry");
	}
	return isItem(store.entry) ? store.entry.value : undefined;
}
