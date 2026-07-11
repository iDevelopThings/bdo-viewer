import {type Item, Zone} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model/index.ts";
import type {MaybeReadonly} from "@/types.ts";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {wrap} from "@/utils.tsx";



export function isGrindSpot(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.GrindSpot, value: Zone } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === SourceKind.GrindSpot;
}

const sym = Symbol("WrappedZone")

export type WrappedZone = Zone & {}

export function WrapZone(value: Zone | undefined) {
	return wrap(value, sym, () => ({
		testing: true
	}))
} 