// src/dev/wails-runtime-shim.ts
import { Call as RealCall } from "@wailsio/runtime";
export * from "@wailsio/runtime";           // re-export everything untouched (live bindings)

export const Call = new Proxy(RealCall, {    // explicit export shadows the `*` for this name
	get(target, prop, receiver) {
		const value = Reflect.get(target, prop, receiver);
		if (typeof value !== "function") return value;
		return (...args: any[]) => {
			//@ts-ignore
			if(!window?.__app?.wailsDebug?.enabled) {
				return (value as Function).apply(target, args); // keep this = RealCall
			}

			console.log(`[wails] ${String(prop)}(`, ...args, ")");
			const result = (value as Function).apply(target, args); // keep this = RealCall
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
