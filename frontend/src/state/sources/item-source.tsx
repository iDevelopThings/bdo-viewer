import {type Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model/index.ts";
import type {DeepReadonly} from "@/types.ts";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {wrap} from "@/utils.tsx";

export function isItem(entry: UntypedSourceEntry | DeepReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Item, value: Item } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === "item";
}
