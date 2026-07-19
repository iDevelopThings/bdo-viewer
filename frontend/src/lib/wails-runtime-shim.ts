import {Call as RealCall} from "@wailsio/runtime";

export * from "@wailsio/runtime"; // re-export everything untouched (live bindings)

// explicit export shadows the `*` for this name
export const Call = new Proxy(RealCall, {
	get(target, prop, receiver) {
		const value = Reflect.get(target, prop, receiver);
		if (typeof value !== "function") return value;
		return (...args: any[]) => {
			if (!window?.__app?.wailsDebug?.enabled) {
				return (value as (...args: any[]) => any).apply(target, args); // keep this = RealCall
			}

			console.log(`[wails] ${String(prop)}(`, ...args, ")");
			const result = (value as (...args: any[]) => any).apply(target, args); // keep this = RealCall
			if (result && typeof result.then === "function") {
				result.then(
					(r: any) => console.log(`[wails] ${String(prop)} →`, r),
					(e: any) => console.error(`[wails] ${String(prop)} ✕`, e),
				);
			}
			return result;
		};
	},
});
