import {InputGroup} from "@/components/ui/input-group";
import {XIcon} from "lucide-react";
import {SortControls, SortControlsProps} from "@/components/entry-list/entry-list.tsx";
import {Input} from "@/components/ui/input";
import {ReactNode} from "react";
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
				<Input
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
				<button
					type={"button"}
					data-testid={"clear-list"}
					title={"Clear search and filters"}
					onClick={() => {
						setQuery("");
						onClearFilters?.();
					}}
					className={"h-9 w-9 flex items-center justify-center shrink-0 rounded-md border border-input bg-transparent dark:bg-input/30 text-fg-muted outline-none cursor-pointer hover:bg-surface-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"}
				>
					<XIcon className={"size-4"} />
				</button>
			)}
			{sortControls && <SortControls {...sortControls} />}
		</div>
	);
}
