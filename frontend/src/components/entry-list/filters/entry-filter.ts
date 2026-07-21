import {createContext, useContext, type ReactNode} from "react";
import {proxy} from "valtio";
import {persistSync} from "@/lib/persist-sync.ts";
import type {ListSourceParams} from "@bindings/bdo-viewer/internal/sources";

export type EntryFilterParams = Omit<ListSourceParams, "path_parts" | "sub_category" | "category" | "query">;

export type EntryFilterControl<T> = {
	id: string;
	// Dotted path into params.filters where this control's value lands, e.g. "crystals.statIds".
	path: string;
	initial: T;
	// Empty values are left out of the query entirely rather than sent as an empty constraint.
	isEmpty: (value: T) => boolean;
	render: (ctx: {value: T, set: (next: T) => void, open: boolean}) => ReactNode;
};

// Infers T from `initial` so callers don't annotate every field.
export function defineEntryFilter<T>(control: EntryFilterControl<T>): EntryFilterControl<T> {
	return control;
}

// Value type erased so a mixed list of controls can be held together; each control still only ever
// sees its own value, widened at the call boundary rather than in the definition.
export type AnyEntryFilterControl = Omit<EntryFilterControl<never>, "initial"> & {initial: unknown};

/**
 * Search text and filter values for one or more pickers. Fixed constraints live in `params`;
 * everything the user can change lives here, so pickers sharing an instance share both.
 */
export class EntryFilterStore {
	public query = "";
	public values: Record<string, unknown> = {};

	constructor(
		// Constraints and controls come from the provider's props, so they're re-assigned rather
		// than readonly — only query/values are the user's, and only they are ever persisted.
		public params: EntryFilterParams = {},
		public controls: AnyEntryFilterControl[] = [],
	) {
	}

	public getValue(control: AnyEntryFilterControl): unknown {
		return this.values[control.id] ?? control.initial;
	}

	public setValue(control: AnyEntryFilterControl, value: unknown) {
		this.values[control.id] = value;
	}

	// This store's constraints, the picker's own on top, then each control's value at its path.
	public resolve(own?: EntryFilterParams): EntryFilterParams {
		let filters = mergeFilters(this.params.filters ?? {}, own?.filters ?? {});

		for (const control of this.controls) {
			const value = this.getValue(control);
			if (control.isEmpty(value as never)) {
				continue;
			}
			filters = mergeFilters(filters, filterPatch(control.path, value));
		}

		return {...this.params, ...own, filters};
	}

	/**
	 * A proxied store, restoring the last search and filter values when given a key. Returns the
	 * persistence handle too: the caller owns its lifecycle (subscribe on mount, flush on unmount).
	 */
	public static create(params?: EntryFilterParams, controls?: AnyEntryFilterControl[], persistKey?: string) {
		const store = new EntryFilterStore(params, controls);
		if (!persistKey) {
			return {store : proxy(store)};
		}

		const persisted = persistSync(store, `entry-filter-${persistKey}`, {
			debounceTime  : 300,
			mergeStrategy : {
				isAsync : false,
				// Assign onto the instance rather than spreading into a new object, which would drop
				// the prototype and with it resolve()/getValue(). Only the user's state is restored.
				merge : (state, restored) => Object.assign(state, {
					query  : restored.query ?? "",
					values : restored.values ?? {},
				}),
			},
		});

		return {store : persisted.store, persisted};
	}
}

// Objects merge, everything else (arrays, scalars) replaces. Keeps a picker's own constraints
// composable with the store's without any caller writing a merge.
function mergeFilters(base: unknown, patch: unknown): unknown {
	if (!isPlainObject(base) || !isPlainObject(patch)) {
		return patch === undefined ? base : patch;
	}

	const out: Record<string, unknown> = {...base};
	for (const [key, value] of Object.entries(patch)) {
		out[key] = mergeFilters(out[key], value);
	}

	return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Expands "crystals.statIds" + value into {crystals: {statIds: value}} so it can be merged like
// any other filter fragment.
function filterPatch(path: string, value: unknown): Record<string, unknown> {
	const keys = path.split(".");
	return keys.reduceRight<Record<string, unknown>>(
		(acc, key, i) => (i === keys.length - 1 ? {[key] : value} : {[key] : acc}),
		{},
	);
}

// Lives here rather than beside the provider so vite HMR can't leave it undefined — this module
// exports no components (see detail-context.ts for the same treatment).
export const EntryFilterContext = createContext<EntryFilterStore | null>(null);

export function useEntryFilterStore(): EntryFilterStore {
	const store = useContext(EntryFilterContext);
	if (!store) {
		throw new Error("entry pickers must be rendered inside an <EntryFilterProvider>");
	}

	return store;
}
