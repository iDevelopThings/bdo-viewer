import {type ReactNode} from "react";
import {ChevronRightIcon} from "lucide-react";
import {type MaybeReadonly, grades} from "@/types.ts";
import {CHARACTER_CLASSES} from "@/state/gear/gear-slots.gen.ts";
import {Input} from "@/components/ui/input.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList} from "@/components/ui/combobox.tsx";
import {Label} from "@/components/ui/label.tsx";
import {useSnapshot} from "valtio/react";
import {global, toggleExpanded} from "@/state/global.tsx";

// Mirrors the Go-side itemFilters struct (internal/sources/item_source.go) -
// equipSlots isn't exposed here since callers that care about it (item picker)
// derive it from context rather than letting the user pick it.
export type ItemFilters = {
	grade?: string;
	itemType?: string;
	equipType?: string;
	effect?: string;
	equipSlots?: string[];
	class?: string;
	craftable?: boolean;
};

export type ItemFilterField = "grade" | "class" | "itemType" | "equipType" | "effect";

const ALL_FIELDS: ItemFilterField[] = ["grade", "class", "itemType", "equipType", "effect"];

function FilterRow({label, children}: { label: string, children: ReactNode }) {
	return (
		<div className={"flex items-center gap-3"}>
			<Label className={"w-20 shrink-0 text-xs text-muted-foreground"}>{label}</Label>
			<div className={"flex-1 min-w-0"}>{children}</div>
		</div>
	);
}

export function ItemFiltersPanel({value, onChange, fields = ALL_FIELDS}: {
	value: MaybeReadonly<ItemFilters>;
	onChange: (next: ItemFilters) => void;
	fields?: ItemFilterField[];
}) {
	const set = <K extends keyof ItemFilters>(key: K, v: ItemFilters[K]) =>
		onChange({...value, [key] : v} as ItemFilters);

	const globalState = useSnapshot(global);

	const id       = `item-filters-panel`;
	const expanded = globalState.expandedSources.has(id);


	return (
		<div>
			<div
				className={"group select-none flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"}
				data-panel-open={expanded ? "true" : undefined}
				onClick={() => toggleExpanded(id)}
			>
				<ChevronRightIcon className={"size-3.5 transition-transform group-data-panel-open:rotate-90"} />
				Filters
			</div>
			{expanded && (
				<div className={"flex flex-col gap-2 pt-2"}>
					{fields.includes("grade") && (
						<FilterRow label={"Grade"}>
							<Select
								value={value.grade ?? null}
								onValueChange={v => set("grade", v ?? undefined)}
							>
								<SelectTrigger size={"sm"} className={"w-full"}>
									<SelectValue placeholder={"Any grade"}>
										{(v: string | null) => v ? v[0].toUpperCase() + v.slice(1) : "Any grade"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={null}>Any grade</SelectItem>
									{Object.keys(grades).map(g => (
										<SelectItem key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FilterRow>
					)}

					{fields.includes("class") && (
						<FilterRow label={"Class"}>
							<Combobox
								items={CHARACTER_CLASSES}
								value={value.class ?? null}
								onValueChange={v => set("class", v ?? undefined)}
							>
								<ComboboxInput placeholder={"Any class"} showClear className={"w-full"} />
								<ComboboxContent>
									<ComboboxEmpty>No matching class.</ComboboxEmpty>
									<ComboboxList>
										{(item: string) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}
									</ComboboxList>
								</ComboboxContent>
							</Combobox>
						</FilterRow>
					)}

					{fields.includes("itemType") && (
						<FilterRow label={"Item Type"}>
							<Input
								placeholder="Any item type"
								value={value.itemType ?? ""}
								onChange={e => set("itemType", e.target.value || undefined)}
								className={"w-full"}
							/>
						</FilterRow>
					)}

					{fields.includes("equipType") && (
						<FilterRow label={"Equip Type"}>
							<Input
								placeholder="Any equip type"
								value={value.equipType ?? ""}
								onChange={e => set("equipType", e.target.value || undefined)}
								className={"w-full"}
							/>
						</FilterRow>
					)}

					{fields.includes("effect") && (
						<FilterRow label={"Effect"}>
							<Input
								placeholder="Any effect"
								value={value.effect ?? ""}
								onChange={e => set("effect", e.target.value || undefined)}
								className={"w-full"}
							/>
						</FilterRow>
					)}
				</div>
			)}

		</div>
	);
}
