import {InputGroup, InputGroupAddon, InputGroupInput} from "@/components/ui/input-group";
import {SearchIcon, XIcon} from "lucide-react";
import type { SortControlsProps} from "@/components/entry-list/entry-list.tsx";
import {SortControls} from "@/components/entry-list/entry-list.tsx";
import {Button} from "@/components/ui/button.tsx";
import type {ReactNode} from "react";
import {Label} from "@/components/ui/label.tsx";

export function FilterRow({label, children}: { label: string, children: ReactNode }) {
	return (
		<div className={"flex items-center gap-3"}>
			<Label className={"w-20 shrink-0 text-xs text-fg-subtle"}>{label}</Label>
			<div className={"flex-1 min-w-0"}>{children}</div>
		</div>
	);
}

export function EntryFilterHeader(
	{
		query,
		setQuery,

		hasActiveFilters,
		onClearFilters,

		sortControls,

		defaultFocus,
	}: {
		query: string
		setQuery: (q: string) => void

		hasActiveFilters: boolean
		onClearFilters?: () => void

		sortControls?: SortControlsProps

		defaultFocus?:boolean
	}
) {
	return (
		<div className={"flex flex-row gap-1 items-center"}>
			<InputGroup className={"flex-1 min-w-0"}>
				<InputGroupAddon>
					<SearchIcon />
				</InputGroupAddon>
				<InputGroupInput
					id={"source-list-search"}
					placeholder="Search..."
					autoFocus={defaultFocus}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
					}}
				/>
			</InputGroup>
			{hasActiveFilters && (
				<Button
					type={"button"}
					variant={"outline"}
					size={"icon"}
					data-testid={"clear-list"}
					title={"Clear search and filters"}
					onClick={() => {
						setQuery("");
						onClearFilters?.();
					}}
				>
					<XIcon />
				</Button>
			)}
			{sortControls && <SortControls {...sortControls} />}
		</div>
	);
}
