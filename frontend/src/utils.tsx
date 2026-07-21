import {useRef, useCallback, useEffect, useState} from "react";

export const numberFormat = new Intl.NumberFormat("en-US", {
	style                    : "decimal",
	maximumFractionDigits    : 2,
	minimumFractionDigits    : 0,
	maximumSignificantDigits : 3,
	compactDisplay           : "short",
	useGrouping              : true
});

export function darkenHex(hex: string, percent: number) {
	hex = hex.replace("#", "");
	if (hex.length === 3) {
		hex = hex.split("").map(c => c + c).join("");
	}

	const num = parseInt(hex, 16);
	let r     = (num >> 16) & 0xff;
	let g     = (num >> 8) & 0xff;
	let b     = num & 0xff;

	r = Math.max(0, Math.round(r * (1 - percent)));
	g = Math.max(0, Math.round(g * (1 - percent)));
	b = Math.max(0, Math.round(b * (1 - percent)));

	return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}

export function durationLabel(ms: number | undefined): string | undefined {
	if (ms === undefined) {
		return undefined;
	}
	const s = Math.floor(ms / 1000);
	if (s >= 86400) {
		const d = s / 86400;
		return d === 1 ? "1 day" : `${d} days`;
	} else if (s >= 3600) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		return m === 0 ? `${h} h` : `${h}h ${m}m`;
	} else if (s >= 60) {
		const m   = Math.floor(s / 60);
		const sec = s % 60;
		return sec === 0 ? `${m} min` : `${m}m ${sec}s`;
	} else {
		return `${s}s`;
	}
}

// Convert a BDO 0xAARRGGBB (or 0xRRGGBB) hex to a CSS colour.
export function parseARGB(hex?: string, alpha?: number): string | undefined {
	if (!hex) {
		return undefined;
	}
	if (hex.startsWith("0x") || hex.startsWith("0X")) {
		hex = hex.slice(2);
	}
	let a = 255, r: number, g: number, b: number;
	if (hex.length === 8) {
		a = parseInt(hex.slice(0, 2), 16);
		r = parseInt(hex.slice(2, 4), 16);
		g = parseInt(hex.slice(4, 6), 16);
		b = parseInt(hex.slice(6, 8), 16);
	} else if (hex.length === 6) {
		r = parseInt(hex.slice(0, 2), 16);
		g = parseInt(hex.slice(2, 4), 16);
		b = parseInt(hex.slice(4, 6), 16);
	} else {
		return undefined;
	}

	if (alpha !== undefined) {
		a = (a / 255) * alpha;
	} else {
		a = a / 255;
	}

	return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

/**
 * Formats our number `1,100,000` as `1.1m` etc
 */
export function moneyLabel(value: number | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value >= 1_000_000_000_000) {
		return `${(value / 1_000_000_000_000).toFixed(1)}t`;
	} else if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(1)}b`;
	} else if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}m`;
	} else if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}k`;
	} else {
		return value.toString();
	}
}

// getMiddleClickProps wires a self-contained nav control: left-click acts, middle-click
// runs the alt action (e.g. open pinned). Clicks stop here so the control never also
// triggers a clickable ancestor (an icon inside a clickable recipe row, a chip in a card).
export function getMiddleClickProps(
	handleAction: () => void,
	handleRegularClick: () => void
) {
	return {
		onClick     : e => {
			e.stopPropagation();
			handleRegularClick();
		},
		onMouseDown : e => {
			if (e.button === 1) {
				e.preventDefault();
			}
		},
		onAuxClick  : e => {
			if (e.button === 1) {
				e.stopPropagation();
				handleAction();
			}
		}
	};
}

export type Fold<T> = T extends object ? { [K in keyof T]: Fold<T[K]> } : T;

export function wrap<T extends object, S extends symbol, M extends object>(
	object: T,
	symbol: S,
	merge: M | ((obj: T) => M)
): Fold<T & Record<S, true> & M>;
export function wrap<T extends object, S extends symbol, M extends object>(
	object: T | undefined,
	symbol: S,
	merge: M | ((obj: T) => M)
): (Fold<T & Record<S, true> & M>) | undefined;
export function wrap<T extends object, S extends symbol, M extends object>(
	object: T | undefined,
	symbol: S,
	merge: M | ((obj: T) => M)
) {
	if (!object) return undefined;

	const extra = typeof merge === "function" ? merge(object) : merge;

	Object.defineProperty(object, symbol, {value : true});
	Object.defineProperties(object, Object.getOwnPropertyDescriptors(extra));

	return object as Fold<T & Record<S, true> & M>;
	// return Object.assign(object, { [symbol]: true } as Record<S, true>, extra);
}

/*
export function wrap<T, S extends symbol, M extends ((obj: T) => object), MM extends M extends (obj: T) => infer R ? R : M
>(
	object: T | undefined,
	symbol: S,
	merge: MM
) {

	if (!object) {
		return undefined;
	}
	/!* if ((object as any)[symbol]) {
		return object as unknown as ReturnType<typeof wrap<T>>;
	} *!/

	return Object.assign(object, {
		[symbol] : true,
		...(
			(typeof merge === "function"
			 ? (merge)(object)
			 : merge
			)
		)
	});
} */


export function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
	const timer = useRef<NodeJS.Timeout | null>(null);

	const debouncedCallback = useCallback((...args: Parameters<T>) => {
		if (timer.current) {
			clearTimeout(timer.current);
		}
		timer.current = setTimeout(() => {
			callback(...args);
		}, delay);
	}, [callback, delay]);

	useEffect(() => {
		return () => {
			if (timer.current) {
				clearTimeout(timer.current);
			}
		};
	}, []);

	return debouncedCallback;
}

export function useDebouncedValue<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
}

/*

export function useDisposableEventListener<
	TEventTarget extends NonUndefined<object>,
	TListener extends FunctionKeys<NonUndefined<TEventTarget>>
>(
	obj: TEventTarget,
	eventName: TListener,
	listener: NonNullable<NonUndefined<TEventTarget>[TListener]> extends (...args: any[]) => any ? NonNullable<NonUndefined<TEventTarget>[TListener]> : never
) {
	if (!obj || !eventName || !listener) {
		throw new Error("useDisposableEventListener: obj, eventName, and listener must be provided");
	}

	useEffect(() => {
		const dispose = (obj[eventName] as any)(listener);
		console.log("subscribed to event", eventName, "on", obj, "with listener", listener, "dispose function:", dispose);

		return () => {
			if (dispose && typeof dispose === "function") {
				console.log("disposing event listener for", eventName, "on", obj);
				dispose();
			} else {
				console.warn("dispose is not a function for event", eventName, "on", obj);
			}
		};
	}, [obj, eventName, listener]);
}
*/


interface IDisposable {
	dispose(): void;
}

// vscode/dockview event shape: subscribe → disposable
type Event<T> = (listener: (e: T) => void) => IDisposable;

// keys of T whose value is an Event<...>
type EventKeys<T> = {
	[K in keyof T]: T[K] extends Event<any> ? K : never;
}[keyof T];

// payload of a specific event key
type EventPayload<T, K extends keyof T> =
	T[K] extends Event<infer P> ? P : never;

export function useDisposableEventListener<
	T,
	K extends EventKeys<NonNullable<T>>,
>(
	target: T | null | undefined,
	eventName: K,
	handler: (e: EventPayload<NonNullable<T>, K>) => void,
): void {
	const handlerRef = useRef(handler);
	useEffect(() => {
		handlerRef.current = handler;
	});

	useEffect(() => {
		if (!target) return;
		const subscribe  = (target as NonNullable<T>)[eventName] as Event<EventPayload<NonNullable<T>, K>>;
		const disposable = subscribe.call(target, (e) => handlerRef.current(e));
		return () => disposable.dispose();
	}, [target, eventName]);
}
