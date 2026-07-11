import {type Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model/index.ts";
import type {DeepReadonly} from "@/types.ts";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";



export function isItem(entry: UntypedSourceEntry | DeepReadonly<UntypedSourceEntry> | undefined): entry is { type: SourceKind.Item, value: Item } {
	if (entry === undefined) {
		return false;
	}
	return entry.type === "item";
}

const wrappedItemSymbol = Symbol("WrappedItem");

type WrappedItem = Item & {}

export function WrapItem(item: Item | undefined): WrappedItem | undefined {
	if (!item) {
		return undefined;
	}
	if ((item as any)[wrappedItemSymbol]) {
		return item as WrappedItem;
	}

	return Object.assign(item, {
		[wrappedItemSymbol] : true,


	});
} 