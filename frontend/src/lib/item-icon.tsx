import {EntryTooltip} from "@/components/details/entry-tooltip.tsx";
import {parseURN} from "@/lib/urn.ts";
import {cn} from "@/lib/utils.ts";

export function ItemIcon({urn, className, imageClass}: { urn: string, className?: string, imageClass?: string }) {
	// Icon assets are still served by numeric id (/icons/icons/<id>.webp), so pull
	// the id back out of the URN for the image path; navigation/tooltip use the URN.
	const id = parseURN(urn).id;
	return (
		<EntryTooltip urn={urn} className={className ? className : "flex-1 min-w-0 gap-2"}>
			<img src={`/icons/icons/${id}.webp`} alt={`item: ${id}`} className={cn(["w-5 h-5 shrink-0", imageClass])} />
		</EntryTooltip>
	);
}
