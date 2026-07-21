/* eslint-disable react-refresh/only-export-components -- the filter descriptor and the control it
   renders belong together; this file rarely changes, so losing fast refresh on it costs nothing. */
import {proxy} from "valtio";
import {ref} from "valtio/vanilla";
import {useSnapshot} from "valtio/react";
import {useState} from "react";
import {useAsync} from "react-async-hook";
import {GetCrystalStatIds} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import type {CrystalStatIdInfo} from "@bindings/bdo-viewer/internal/catalog";
import type {StatId} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import type {MaybeReadonly} from "@/types.ts";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {ItemTypes} from "@/lib/types/item-types.gen.ts";
import {defineEntryFilter, type EntryFilterParams} from "@/components/entry-list/filters/entry-filter.ts";
import type {CrystalGroupUsage} from "@bindings/bdo-viewer/internal/gear";

// Derived from the catalog and fixed for the app's lifetime, so it's fetched once for every
// picker rather than per socket.
const crystalStats = proxy({
	ids : [] as CrystalStatIdInfo[],
});

export const crystalStatsFilter = defineEntryFilter({
	id      : "crystalStats",
	path    : "crystals.statIds",
	initial : [] as StatId[],
	isEmpty : value => value.length === 0,
	render  : ({value, set, open}) => <CrystalStatSelect value={value} onChange={set} load={open} />,
});

export const CRYSTAL_FILTERS = [crystalStatsFilter];

/**
 * Picker constraints for the transfusion board. groupUsage is what lets the backend drop families
 * the preset is already full of — the item source can't read the builder's loadout, so the counts
 * it computes have to come back down with the query.
 */
export function crystalPickerParams(groups: MaybeReadonly<CrystalGroupUsage[]>): EntryFilterParams {
	return {
		source   : SourceKind.Item,
		sort     : "grade",
		sort_dir : "desc",
		filters  : {
			itemType : ItemTypes.Jewel,
			// Presence (not just the fields) is what tells the backend to keep only transfusion jewels.
			crystals : {
				groupUsage : Object.fromEntries(groups.map(g => [g.key, g.used])),
			},
		},
	};
}

function CrystalStatSelect({value, onChange, load}: {
	value: MaybeReadonly<StatId[]>
	onChange: (next: StatId[]) => void
	// Defer the fetch until the picker it lives in is actually opened.
	load: boolean
}) {
	const {ids} = useSnapshot(crystalStats);

	// The select's popup has to live inside the combobox's DOM: base-ui dismisses the combobox on
	// any press outside its own subtree, and a body-portalled popup counts as outside. It goes in
	// the positioner rather than the popup itself — the popup is overflow-hidden and would clip it.
	const [host, setHost] = useState<HTMLElement | null>(null);
	const container       = host?.closest<HTMLElement>("[data-slot=combobox-content]")?.parentElement ?? undefined;

	useAsync(async () => {
		if (!load || crystalStats.ids.length > 0) {
			return;
		}
		crystalStats.ids = ref(await GetCrystalStatIds() ?? []);
	}, [load]);

	if (ids.length === 0) {
		return null;
	}

	return (
		<div className={"px-1 pb-1"} ref={setHost}>
			<Select
				multiple
				value={[...value]}
				onValueChange={(next: StatId[]) => onChange(next)}
			>
				<SelectTrigger size={"sm"} className={"w-full text-xs"} title={"Filter by stat"} data-testid={"crystal-stat-filter"}>
					<SelectValue>
						{(selected: StatId[]) => selected.length === 0
							? "Any stat"
							: selected.length === 1
								? ids.find(s => s.statId === selected[0])?.name ?? selected[0]
								: `${selected.length} stats`}
					</SelectValue>
				</SelectTrigger>
				<SelectContent container={container} alignItemWithTrigger={false} className={"max-h-64"}>
					{ids.map(stat => (
						<SelectItem key={stat.statId} value={stat.statId} className={"text-xs"}>
							{stat.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
