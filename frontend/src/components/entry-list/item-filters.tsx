import {ChevronRightIcon} from "lucide-react";
import {type MaybeReadonly} from "@/types.ts";
import {Input} from "@/components/ui/input.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList} from "@/components/ui/combobox.tsx";
import {toggleExpanded, useIsExpanded} from "@/state/global.tsx";
import {FilterRow} from "@/components/entry-list/entry-filter-panel.tsx";
import {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {iterTitle} from "@/lib/types/character-classes.gen.ts";
import {ItemGrade} from "@/lib/types/item-grades.gen.ts";
import {gradeOptions} from "@/lib/types/item-grades.ts";

const CLASS_TITLES = [...iterTitle()];

// Mirrors the Go-side itemFilters struct (internal/sources/item_source.go) -
// equipSlots isn't exposed here since callers that care about it (item picker)
// derive it from context rather than letting the user pick it.
export type ItemFilters = {
	grade?: ItemGrade;
	itemType?: string;
	equipType?: string;
	effect?: string;
	equipSlots?: SlotName[];
	class?: string;
	craftable?: boolean;
};

export type ItemFilterField = "grade" | "class" | "effect";

const ALL_FIELDS: ItemFilterField[] = ["grade", "class", "effect"];

export function ItemFiltersPanel({value, onChange, fields = ALL_FIELDS}: {
	value: MaybeReadonly<ItemFilters>;
	onChange: (next: ItemFilters) => void;
	fields?: ItemFilterField[];
}) {
	const set = <K extends keyof ItemFilters>(key: K, v: ItemFilters[K]) =>
		onChange({...value, [key] : v} as ItemFilters);

	const id       = `item-filters-panel`;
	const expanded = useIsExpanded(id);

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
										{(v: number | null) => {
											if (v == null) return "Any grade";
											return gradeOptions.find(g => g.value === v)?.name ?? "Any grade";
										}}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={null}>Any grade</SelectItem>
									{gradeOptions.map(g => (
										<SelectItem key={g.name} value={g.value}>
											{g.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FilterRow>
					)}

					{fields.includes("class") && (
						<FilterRow label={"Class"}>
							<Combobox
								items={CLASS_TITLES}
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
