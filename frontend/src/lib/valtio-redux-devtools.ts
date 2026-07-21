import {snapshot, subscribe} from "valtio/vanilla";
import type {StoreEnhancer} from "redux";

// valtio's built-in `devtools()` only talks to the Redux DevTools *browser
// extension* (window.__REDUX_DEVTOOLS_EXTENSION__), which WebView2 has no way to
// load. This bridges a proxy into a throwaway redux store wired to the standalone
// Redux DevTools over a socket instead — run the server with `npm run devtools:redux`.
export interface RemoteDevtoolsOptions {
	name: string;
	hostname?: string;
	port?: number;
}

export async function connectReduxDevtools(
	proxyObject: object,
	options: RemoteDevtoolsOptions,
): Promise<(() => void) | undefined> {
	if (!import.meta.env.DEV) {
		return;
	}

	const {createStore} = await import("redux");
	const {composeWithDevTools} = await import("@redux-devtools/remote");

	// Guards mirror valtio's own devtools util: a devtools time-travel writes back
	// into the proxy, whose async notification must be swallowed rather than echoed
	// back to the store. `syncingToStore` suppresses our own dispatch from looking
	// like a time-travel; `isTimeTraveling` is reset inside the async proxy callback.
	let syncingToStore = false;
	let isTimeTraveling = false;

	const reducer = (state: unknown, action: {type: string; state?: unknown}) => {
		if (action.type.startsWith("@@valtio")) {
			return action.state;
		}
		return state;
	};

	const composeEnhancers = composeWithDevTools({
		name     : options.name,
		realtime : true,
		hostname : options.hostname ?? "localhost",
		port     : options.port ?? 8000,
		secure   : false,
	}) as (...funcs: StoreEnhancer[]) => StoreEnhancer;

	const store = createStore(reducer, snapshot(proxyObject), composeEnhancers());

	const unsubProxy = subscribe(proxyObject, () => {
		if (isTimeTraveling) {
			isTimeTraveling = false;
			return;
		}
		syncingToStore = true;
		store.dispatch({type : "@@valtio/UPDATE", state : snapshot(proxyObject)});
		syncingToStore = false;
	});

	const unsubStore = store.subscribe(() => {
		if (syncingToStore) {
			return;
		}
		isTimeTraveling = true;
		Object.assign(proxyObject, store.getState() as object);
	});

	return () => {
		unsubProxy();
		unsubStore();
	};
}
