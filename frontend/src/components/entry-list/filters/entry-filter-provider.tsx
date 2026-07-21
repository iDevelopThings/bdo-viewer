import {type PropsWithChildren, useEffect, useState} from "react";
import {EntryFilterContext, EntryFilterStore, type AnyEntryFilterControl, type EntryFilterParams} from "@/components/entry-list/filters/entry-filter.ts";

export type EntryFilterProviderProps = PropsWithChildren<{
	// Constraints shared by every picker below; each picker merges its own on top.
	params: EntryFilterParams;
	controls?: AnyEntryFilterControl[];
	// Restores the last search and filter values, so they survive this subtree unmounting —
	// dockview drops hidden tabs (defaultRenderer "onlyWhenVisible").
	persistKey?: string;
}>;

export function EntryFilterProvider({params, controls, persistKey, children}: EntryFilterProviderProps) {
	const [{store, persisted}] = useState(() => EntryFilterStore.create(params, controls, persistKey));

	// Constraints are props, not state: follow them when the caller's change (a gear slot's class
	// or equip slots, say) instead of freezing whatever they were at mount.
	const paramsKey = JSON.stringify(params);
	useEffect(() => {
		store.params = params;
		// paramsKey stands in for params' content.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [store, paramsKey]);

	useEffect(() => {
		store.controls = controls ?? [];
	}, [store, controls]);

	// Flush on unmount: the write is debounced, and this subtree is exactly what gets unmounted.
	useEffect(() => {
		const unsubscribe = persisted?.subscribe();
		return () => {
			unsubscribe?.();
			persisted?.persist();
		};
	}, [persisted]);

	return (
		<EntryFilterContext.Provider value={store}>
			{children}
		</EntryFilterContext.Provider>
	);
}
