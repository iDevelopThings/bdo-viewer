import {proxy, type Snapshot, snapshot, subscribe} from "valtio";
import {LocalStorageStrategy, type MergeStrategy, type SerializationStrategy, type StorageStrategy, type SerializedSpecialType, type TypeMarker} from "valtio-persist";
import {proxyMap, proxySet} from "valtio/utils";

const TYPE_MARKER = {
	Date       : "__DATE__",
	Map        : "__MAP__",
	Set        : "__SET__",
	Symbol     : "__SYMBOL__",
	Function   : "__FUNCTION__",
	Class      : "__CLASS__",
	Error      : "__ERROR__",
	DOMElement : "__DOM_ELEMENT__",
};

/**
 * Default JSON serialization strategy (synchronous)
 */
export class JSONSerializationStrategy<T> implements SerializationStrategy<T, false> {
	readonly isAsync = false as const;

	public canProcess: (value: unknown, path?: string) => boolean = () => true;

	serialize(state: Snapshot<T>): string {
		const processed = this.processForSerialization(state, undefined);
		return JSON.stringify(processed);
	}

	deserialize(data: string): T {
		const parsed = JSON.parse(data);
		return this.processForDeserialization(parsed, undefined) as T;
	}

	private computePath(parentPath: string | undefined, key: string | number): string {
		if (parentPath === undefined) {
			return String(key);
		}
		if (typeof key === "number") {
			return `${parentPath}[${key}]`;
		}
		return `${parentPath}.${key}`;
	}

	private processForSerialization(obj: unknown, path: string | undefined): unknown {
		// Handle null or undefined
		if (obj === null || obj === undefined) {
			return obj;
		}

		// Handle primitive types
		if (
			typeof obj !== "object" &&
			typeof obj !== "function" &&
			typeof obj !== "symbol"
		) {
			return obj;
		}

		// Handle Symbol
		if (typeof obj === "symbol") {
			const r = {
				__type : TYPE_MARKER.Symbol,
				value  : obj.description,
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Function
		if (typeof obj === "function") {
			const r = {
				__type : TYPE_MARKER.Function,
				value  : obj.name || "anonymous",
				// Optionally add function.toString() if you want to try reconstructing it
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}
			return r;
		}

		// Handle Date
		if (obj instanceof Date) {
			const r = {
				__type : TYPE_MARKER.Date,
				value  : obj.toISOString(),
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Map
		if (obj instanceof Map) {
			const r = {
				__type : TYPE_MARKER.Map,
				value  : Array.from(obj.entries()),
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Set
		if (obj instanceof Set) {
			const r = {
				__type : TYPE_MARKER.Set,
				value  : Array.from(obj),
			} as SerializedSpecialType;
			if (!this.canProcess(r, path)) {
				return undefined;
			}
			return r;
		}

		// Handle WeakMap and WeakSet - since they can't be enumerated,
		// we return an empty structure of the same type
		if (obj instanceof WeakMap || obj instanceof WeakSet) {
			return null; // or return a placeholder if needed
		}

		// Handle Error
		if (obj instanceof Error) {
			const r = {
				__type : TYPE_MARKER.Error,
				value  : {
					message : obj.message,
					name    : obj.name,
					stack   : obj.stack,
				},
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle DOM Element
		if (typeof window !== "undefined" && obj instanceof Element) {
			// Create a CSS selector for the element (basic implementation)
			let selector = obj.tagName.toLowerCase();
			if (obj.id) selector += `#${obj.id}`;
			else if (obj.className)
				selector += `.${obj.className.replace(/\s+/g, ".")}`;

			const r = {
				__type : TYPE_MARKER.DOMElement,
				value  : selector,
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Class Instances - more complex case
		if (
			// null-prototype objects (Object.create(null)) have no constructor at runtime.
			obj.constructor &&
			obj.constructor !== Object &&
			obj.constructor !== Array
		) {
			// This is a simplified approach; for complex classes you might need more info
			const r = {
				__type    : TYPE_MARKER.Class,
				className : obj.constructor.name,
//				value     : {...obj}, // Convert to plain object
				value : this.processForSerialization({...obj}, path), // Recursively process properties
			} as SerializedSpecialType;

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Arrays
		if (Array.isArray(obj)) {
			const r = obj.map(
				(item, idx) => this.processForSerialization(
					item,
					this.computePath(path, idx)
				)
			);

			if (!this.canProcess(r, path)) {
				return undefined;
			}

			return r;
		}

		// Handle Plain Objects
		{
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
//				console.log('visiting key:', key, 'at path:', this.computePath(path, key), 'with value:', value);
				result[key] = this.processForSerialization(
					value,
					this.computePath(path, key)
				);
			}
			if (!this.canProcess(result, path)) {
				return undefined;
			}

			return result;
		}
	}

	private processForDeserialization(obj: unknown, path: string | undefined): unknown {
		// Handle null or undefined
		if (obj === null || obj === undefined) {
			return obj;
		}

		// Handle primitive types
		if (typeof obj !== "object") {
			return obj;
		}

		// Since we've checked that obj is an object and not null, we can safely cast
		const objRecord = obj as Record<string, unknown>;

		// Handle special type markers
		if ("__type" in objRecord && typeof objRecord.__type === "string") {
			const typeMarker = objRecord.__type as TypeMarker;

			switch (typeMarker) {
				case TYPE_MARKER.Date:
					if (typeof objRecord.value === "string") {
						return new Date(objRecord.value);
					}
					break;

				case TYPE_MARKER.Map:
					if (Array.isArray(objRecord.value)) {
						return proxyMap(new Map(objRecord.value as [unknown, unknown][]));
					}
					break;

				case TYPE_MARKER.Set:
					if (Array.isArray(objRecord.value)) {
						return proxySet(new Set(objRecord.value));
					}
					break;

				case TYPE_MARKER.Symbol:
					if (
						typeof objRecord.value === "string" ||
						objRecord.value === undefined
					) {
						return Symbol(objRecord.value);
					}
					break;

				case TYPE_MARKER.Function:
					// Functions can't be fully reconstructed from serialization
					return () => {
						return undefined;
					};

				case TYPE_MARKER.Error:
					if (typeof objRecord.value === "object" && objRecord.value !== null) {
						const errorValue = objRecord.value as Record<string, unknown>;
						const error      = new Error(
							typeof errorValue.message === "string"
								? errorValue.message
								: "Unknown error",
						);
						if (typeof errorValue.name === "string") {
							error.name = errorValue.name;
						}
						if (typeof errorValue.stack === "string") {
							error.stack = errorValue.stack;
						}
						return error;
					}
					break;

				case TYPE_MARKER.DOMElement:
					if (
						typeof objRecord.value === "string" &&
						typeof document !== "undefined"
					) {
						return document.querySelector(objRecord.value);
					}
					return null;

				case TYPE_MARKER.Class:
					// For class instances, return the value object
					if (typeof objRecord.value === "object" && objRecord.value !== null) {
						return objRecord.value;
					}
					break;

				default:
					return objRecord.value;
			}

			// If we get here, something went wrong in type handling
			return null;
		}

		// Handle Arrays
		if (Array.isArray(obj)) {
			return obj.map((item, idx) => this.processForDeserialization(
				item,
				this.computePath(path, idx)
			));
		}

		// Handle Plain Objects
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(objRecord)) {
			result[key] = this.processForDeserialization(
				value,
				this.computePath(path, key)
			);
		}
		return result;
	}
}

interface HistoryEntry<T> {
	timestamp: number;
	action: string;
	previousState: Partial<T>;
	currentState: Partial<T>;
	path?: string[];
}

interface HistoryOptions<H> {
	enabled?: boolean;
	maxEntries: number;
	trackPaths?: string[] | boolean;
	exportOptions?: {
		autoExport?: boolean;
		exportInterval?: number;
		exportTarget?: "file" | "api" | "console";
		exportPath?: string;
		exportUrl?: string;
		exportFormat?: "json" | "csv" | "custom";
		exportTransformer?: (history: Array<HistoryEntry<H>>) => unknown;
	};
}

// Define your options type (without the key)
interface PersistOptions<T extends object> {
	// How to store state - accepting a constructor
	storageStrategy?: {
		new(): StorageStrategy
	} | StorageStrategy;
	// Controls how objects are serialized
	serializationStrategy?: {
		new(): SerializationStrategy<T>
	} | SerializationStrategy<T>;
	// How to merge stored state with initial state
	mergeStrategy?: {
		new(): MergeStrategy<T>
	} | MergeStrategy<T>;
	// Should the state be persisted at a moment in time
	shouldPersist?: (prevState: Snapshot<T>, nextState: Snapshot<T>) => boolean;
	// Time in milliseconds to debounce persistence operations
	debounceTime?: number;
	// history enabled
	history?: HistoryOptions<T>;
	canSerialize?: (value: unknown, path?: string) => boolean;
}

const isSyncStorage = (
	storage: StorageStrategy<boolean>,
): storage is StorageStrategy<false> => {
	return !storage.isAsync;
};

const isSyncSerializer = <T>(
	serializer: SerializationStrategy<T, boolean>,
): serializer is SerializationStrategy<T, false> => {
	return !serializer.isAsync;
};

const isSyncMerger = <T>(
	merger: MergeStrategy<T, boolean>,
): merger is MergeStrategy<T, false> => {
	return !merger.isAsync;
};

export interface PersistResultSync<T extends object> {
	store: T;
	persist: () => void;
	restore: () => boolean;
	clear: () => void;
	// Start persisting: subscribes to store changes and returns the unsubscribe. Call it in an
	// effect (React) or once for a singleton — keeping subscribe/unsubscribe symmetric so a
	// StrictMode mount→unmount→remount re-establishes the subscription instead of leaving it
	// disposed. Any listeners the store wires up in its own setup follow the same lifecycle.
	subscribe: () => () => void;
}

function debounce(func: () => void, wait: number) {
	let timeout: ReturnType<typeof setTimeout> | null = null;

	return function () {
		if (timeout !== null) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			func();
			timeout = null;
		}, wait);
	};
}

class DefaultMergeStrategy<T> implements MergeStrategy<T, false> {
	isAsync = false as const;

	merge(initialState: T, restoredState: T): T {
		return {...initialState, ...restoredState};
	}
}

// Function to safely update the store without breaking the proxy
export const updateStore = <T extends object>(store: T, newState: T) => {
	for (const key of Object.keys(newState)) {
		store[key as keyof T] = newState[key as keyof T];
	}
};

export function persistSync<T extends object>(
	initialState: T,
	key: string,
	options?: PersistOptions<T>,
): PersistResultSync<T> {
	const defaultOptions = {
		storageStrategy       : LocalStorageStrategy,
		serializationStrategy : JSONSerializationStrategy,
		mergeStrategy         : DefaultMergeStrategy,
		shouldPersist         : () => true,
		debounceTime          : 100,
		canSerialize          : () => true,
	};

	const o = {
		...defaultOptions,
		...options,
	};



	// Create instances from constructors or use provided instances
	const storageInstance =
		      typeof o.storageStrategy === "function"
			      ? new o.storageStrategy()
			      : o.storageStrategy;

	const serializer: SerializationStrategy<T> & {
		canProcess?: (value: unknown, path?: string) => boolean;
	} =
		      typeof o.serializationStrategy === "function"
			      ? new o.serializationStrategy()
			      : o.serializationStrategy;

	serializer.canProcess = o.canSerialize.bind(serializer);

	const merger =
		      typeof o.mergeStrategy === "function"
			      ? new o.mergeStrategy()
			      : o.mergeStrategy;

	// Create storage proxy to support legacy API with deprecation warnings
	const storage = new Proxy(storageInstance, {
		get(target, prop, receiver) {
			// Map legacy methods to new methods with warnings
			if (prop === "getItem") {
				console.warn("Deprecated: use .get() instead of .getItem()");
				return target.get.bind(target);
			}
			if (prop === "setItem") {
				console.warn("Deprecated: use .set() instead of .setItem()");
				return target.set.bind(target);
			}
			if (prop === "removeItem") {
				console.warn("Deprecated: use .remove() instead of .removeItem()");
				return target.remove.bind(target);
			}
			return Reflect.get(target, prop, receiver);
		},
	});

	const {shouldPersist, debounceTime} = o;

	if (!isSyncStorage(storage)) {
		throw new Error("Storage strategy must be synchronous for persistSync.");
	}

	if (!isSyncSerializer(serializer)) {
		throw new Error("Serialization strategy must be synchronous for persistSync.");
	}

	if (!isSyncMerger(merger)) {
		throw new Error("Merge strategy must be synchronous for persistSync.");
	}

	const data = storage.get(key) || null;

	const storedState = data
		? serializer.deserialize(data) : null;

	const mergedState = storedState
		? merger.merge(initialState, storedState)
		: undefined;

	const store = proxy<T>(mergedState ?? initialState);

	let previousState = snapshot(store);

	// Create the persist function - modified to respect shouldPersist even for manual calls
	const persistData = () => {
		const currentState = snapshot(store);

		// Add this check to respect shouldPersist for manual calls
		if (!shouldPersist(previousState, currentState)) {
			return; // Don't persist if shouldPersist returns false
		}

		const serialized = serializer.serialize(currentState);

		// Now we have a definite string type for serialized
		storage.set(key, serialized);
	};

	// Set up persistence
	const debouncedPersist = debounce(persistData, debounceTime);

	// Subscribe on demand rather than eagerly here: the caller binds this in an effect, so the
	// subscribe/unsubscribe pair survives a StrictMode remount (an eager subscription created in
	// render but disposed in an effect cleanup would be torn down and never re-established).
	const subscribeToChanges = () => {
		previousState = snapshot(store);
		return subscribe(store, () => {
			const currentState = snapshot(store);
			if (shouldPersist(previousState, currentState)) {
				debouncedPersist();
			}
			// Update previous state for next comparison
			previousState = currentState;
		});
	};

	// Return the result
	return {
		store,
		subscribe : subscribeToChanges,
		persist   : persistData,
		clear     : () => {
			storage.remove(key);
		},
		restore   : () => {
			const data = storage.get(key) || null;

			const storedState = data
				? serializer.deserialize(data)
				: null;

			const mergedState = storedState
				? merger.merge(initialState, storedState)
				: undefined;

			if (mergedState) {
				updateStore(store, mergedState);
				return true;
			}

			return false;
		},
	};
}

