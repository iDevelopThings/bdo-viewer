import {useSnapshot} from "valtio";
import {Settings2, ChevronUp} from "lucide-react";
import {Switch} from "@/components/ui/switch.tsx";
import {Label} from "@/components/ui/label.tsx";
import {mapState} from "@/components/world-map/map-state.ts";
import {Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger} from "@/components/ui/combobox.tsx";
import {npcRoleLabel} from "@/components/world-map/npc-roles.ts";
import type {NPCSpawnType} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {cn} from "@/lib/utils.ts";

function ToggleRow(
	{id, label, description, checked, onChange}: {
		id: string;
		label: string;
		description: string;
		checked: boolean;
		onChange: (v: boolean) => void
	}) {
	return (
		<div className="flex flex-row items-start justify-between gap-3 rounded px-2 py-1.5 hover:bg-surface-2/60">
			<div className="flex min-w-0 flex-col">
				<Label htmlFor={id} className="cursor-pointer text-xs text-fg">{label}</Label>
				<span className="text-[10px] leading-tight text-fg-subtle">{description}</span>
			</div>
			<Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
		</div>
	);
}

/** Which NPC roles the all-NPC layer draws: a dropdown over the roles the data actually has. A null
 *  selection means every role, so it starts showing everything and you narrow from there. */
function NpcRoleFilter() {
	const map      = useSnapshot(mapState);
	const options  = map.npcRoleOptions as NPCSpawnType[];
	const selected = map.settings.npcRoles as NPCSpawnType[] | null;

	const summary = !selected
		? "All roles"
		: selected.length === 0
			? "No roles"
			: selected.length === 1
				? npcRoleLabel(selected[0])
				: `${selected.length} of ${options.length} roles`;

	return (
		<div className="flex flex-col gap-1 px-2 pb-2">
			<Combobox
				multiple
				items={options}
				itemToStringLabel={(t: NPCSpawnType) => npcRoleLabel(t)}
				value={selected ?? options}
				onValueChange={(v: NPCSpawnType[]) => (mapState.npcRoles = v)}
			>
				<ComboboxTrigger
					className={cn([
						"flex w-full flex-row items-center justify-between gap-2 rounded px-2 py-1",
						"border border-surface-border/70 bg-surface-2/60 text-xs text-fg hover:bg-surface-2"
					])}
				>
					<span className="truncate">{summary}</span>
				</ComboboxTrigger>
				<ComboboxContent className="w-56">
					<ComboboxInput placeholder="Search roles…" showTrigger={false} className="text-xs" />
					<ComboboxEmpty>No matching role.</ComboboxEmpty>
					<ComboboxList>
						{(type: NPCSpawnType) => (
							<ComboboxItem key={type} value={type} className="text-xs">{npcRoleLabel(type)}</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>

			{selected && (
				<button
					onClick={() => (mapState.npcRoles = null)}
					className="self-start text-[10px] text-fg-subtle hover:text-fg"
				>
					Show all roles
				</button>
			)}
		</div>
	);
}

function Group({title, children}: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col border-b border-surface-border py-1 last:border-b-0">
			<span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{title}</span>
			{children}
		</div>
	);
}

/** Collapsible world-map settings, grouped by what they draw. State (and the collapsed state)
 *  live in the persisted map settings. */
export function MapSettingsPanel() {
	const {settings : s} = useSnapshot(mapState);

	if (s.panelCollapsed) {
		return (
			<button
				onClick={() => (mapState.settings.panelCollapsed = false)}
				title="Map settings"
				className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-surface-border/70 bg-surface-1/90 text-fg-muted hover:bg-surface-2 hover:text-fg"
			>
				<Settings2 size={16} />
			</button>
		);
	}

	return (
		<div className="absolute right-3 top-3 z-10 w-60 overflow-hidden rounded-md border border-surface-border/70 bg-surface-1/95 shadow-lg">
			<div className="flex flex-row items-center justify-between border-b border-surface-border px-2 py-1.5">
				<span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
					<Settings2 size={13} /> Map
				</span>
				<button
					onClick={() => (mapState.settings.panelCollapsed = true)}
					title="Collapse"
					className="text-fg-subtle hover:text-fg"
				>
					<ChevronUp size={15} />
				</button>
			</div>

			<div className="max-h-[70vh] overflow-y-auto overflow-x-hidden">
				<Group title="Nodes">
					<ToggleRow
						id="map-nodes" label="Main nodes"
						description="Towns, gateways and field locations"
						checked={s.showNodes}
						onChange={v => (mapState.showNodes = v)}
					/>
					<ToggleRow
						id="map-subnodes" label="Sub-nodes"
						description="Worker production nodes at each location"
						checked={s.showSubNodes}
						onChange={v => (mapState.showSubNodes = v)}
					/>
					<ToggleRow
						id="map-links" label="Links"
						description="Node connections you pay CP to walk"
						checked={s.showLinks}
						onChange={v => (mapState.showLinks = v)}
					/>
					<ToggleRow
						id="map-npcs" label="Node managers"
						description="Where each node's manager / town representative stands"
						checked={s.showNpcs}
						onChange={v => (mapState.showNpcs = v)}
					/>
				</Group>

				<Group title="NPCs">
					<ToggleRow
						id="map-all-npcs" label="All NPCs"
						description="Every placed NPC, one marker per placement"
						checked={s.showAllNpcs}
						onChange={v => (mapState.showAllNpcs = v)}
					/>
					{s.showAllNpcs && <NpcRoleFilter />}
				</Group>

				<Group title="Labels">
					<ToggleRow
						id="map-labels" label="Node names"
						description="Names, once zoomed in far enough"
						checked={s.showLabels}
						onChange={v => (mapState.showLabels = v)}
					/>
					<ToggleRow
						id="map-sub-labels" label="Sub-node names"
						description="Names of sub-nodes, once zoomed in far enough"
						checked={s.showSubLabels}
						onChange={v => (mapState.settings.showSubLabels = v)}
					/>
					<ToggleRow
						id="map-contribution" label="CP cost"
						description="Contribution cost to activate a node"
						checked={s.showContribution}
						onChange={v => (mapState.showContribution = v)}
					/>
				</Group>

				<Group title="Regions">
					<ToggleRow
						id="map-bounds" label="Region bounds"
						description="Each region's world-space box"
						checked={s.showBounds}
						onChange={v => (mapState.showBounds = v)}
					/>
					<ToggleRow
						id="map-region-marks" label="Region marks(Debug)"
						description="Not quite sure what this does currently"
						checked={s.showRegionMarks}
						onChange={v => (mapState.showRegionMarks = v)}
					/>
					<ToggleRow
						id="map-spawns" label="Spawns"
						description="NPC and monster spawn placements — heavy"
						checked={s.showSpawns}
						onChange={v => (mapState.showSpawns = v)}
					/>
				</Group>

				<Group title="Debug">
					<ToggleRow
						id="map-metrics" label="Metrics overlay"
						description="deck.gl render stats"
						checked={s.debugOverlay}
						onChange={v => (mapState.settings.debugOverlay = v)}
					/>
				</Group>
			</div>
		</div>
	);
}
