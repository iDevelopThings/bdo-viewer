import type {ComponentType} from "react";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {ItemFiltersPanel} from "@/components/entry-list/item-filters.tsx";

export type SourceFilterPanelProps<F = Record<string, unknown>> = {
	value: F;
	onChange: (next: F) => void;
};

// Registry of per-source filter panels, keyed by SourceKind - add an entry
// here as each source grows its own Go-side Filters struct (see
// internal/sources/*_source.go). SourceList looks entries up dynamically so
// adding a new source's filters doesn't require touching its render logic.
export const SOURCE_FILTER_PANELS: Partial<Record<SourceKind, ComponentType<SourceFilterPanelProps<any>>>> = {
	[SourceKind.Item] : ItemFiltersPanel,
};

export function getSourceFilterPanel(kind: SourceKind | undefined) {
	return kind ? SOURCE_FILTER_PANELS[kind] : undefined;
}
