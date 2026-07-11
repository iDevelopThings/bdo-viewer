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
export function parseARGB(hex: string, alpha?: number): string | undefined {
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

export function useMiddleClickProps(
	handleAction: () => void,
	handleRegularClick: () => void
) {
	return {
		onClick     : handleRegularClick,
		onMouseDown : e => {
			if (e.button === 1) {
				e.preventDefault();
			}
		},
		onAuxClick  : e => {
			if (e.button === 1) {
				handleAction();
			}
		}
	};
}

export function wrap<T, S extends symbol, M, MR = M extends (value: T) => infer R ? R : M extends object ? M : never>(
	object: T | undefined,
	symbol: S,
	merge: M | ((value: T) => MR)
) {

	if (!object) {
		return undefined;
	}
	/* if ((object as any)[symbol]) {
		return object as unknown as ReturnType<typeof wrap<T>>;
	} */

	return Object.assign(object, {
		[symbol] : true,
		...(typeof merge === "function" ? (merge as (value: T) => MR)(object) : merge)
	});
}