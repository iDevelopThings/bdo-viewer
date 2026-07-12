import {createContext, type PropsWithChildren, useContext, useEffect, useMemo} from "react";
import {useSnapshot} from "valtio/react";
import {Snapshot} from "valtio";
import {persistSync} from "@/lib/persist-sync.ts";
import {GearBuildStore} from "@/state/gear/gear-store.ts";

const GearBuildContext = createContext<GearBuildStore | null>(null);

export type GearBuildProviderProps = PropsWithChildren<{
	buildId?: string;
}>;

export function GearBuildProvider({buildId = "default", children}: GearBuildProviderProps) {
	const storageKey = `gear-build-${buildId}`;

	const store = useMemo(() => {
		const result = persistSync(new GearBuildStore(buildId), storageKey, {
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
				serialize(state: Snapshot<GearBuildStore>): string {
					if (!state) {
						return JSON.stringify({});
					}

					return JSON.stringify({
						buildId        : state.buildId,
						name           : state.name,
						characterClass : state.characterClass,
						slots          : state.slots,
						activeGroup    : state.activeGroup,
						maxOnEquip     : state.maxOnEquip,
					});
				},
				deserialize(data: string): GearBuildStore {
					if (!data || data === "{}") {
						return {} as unknown as GearBuildStore;
					}
					return JSON.parse(data);
				}
			}
		});

		return result.store as GearBuildStore;
	}, [storageKey]);

	useEffect(() => {
		void store.hydrate();
	}, [store]);

	return (
		<GearBuildContext.Provider value={store}>
			{children}
		</GearBuildContext.Provider>
	);
}

export function useGearBuild() {
	const store = useContext(GearBuildContext);
	if (!store) throw new Error("useGearBuild must be used within GearBuildProvider");
	return [store, useSnapshot(store)] as const;
}
