import {NPC} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model/index.ts";
import type {MaybeReadonly} from "@/types.ts";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {wrap} from "@/utils.tsx";



export function isNpc(entry: MaybeReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Npc, value: NPC } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === SourceKind.Npc;
}

const sym = Symbol("WrappedNPC");

export type WrappedNPC = NPC & {}

export function WrapNPC(value: NPC | undefined) {
	return wrap(value, sym, () => ({
		testing : true
	}));
} 