import type {IDockviewPanelProps} from "dockview-react";
import {DetailsItem} from "@/components/details/details-item.tsx";
import {DetailProvider, useDetailStore} from "@/state/detail.tsx";
import type {UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {SourceKind} from "@bindings/bdo-viewer/internal/sources";
import {type ComponentType, useCallback, useEffect, useRef, useState} from "react";
import {useDebounce} from "@/utils.tsx";
import {GrindSpotDetails} from "@/components/details/details-grindspot.tsx";
import {NpcDetails} from "@/components/details/details-npc.tsx";
import {KnowledgeDetails} from "@/components/details/details-knowledge.tsx";
import {RegionDetails} from "@/components/details/details-region.tsx";
import {CharacterDetails} from "@/components/details/details-character.tsx";
import {useSnapshot} from "valtio/react";

function titleOf(entry: UntypedSourceEntry | undefined): string | undefined {
	const value = entry?.value as { name?: string; title?: string } | undefined;
	if (!value || typeof value !== "object") {
		return undefined;
	}
	return value.name ?? value.title;
}

function DetailsPanelInner({entry, props}: { entry: UntypedSourceEntry, props: IDockviewPanelProps }) {

	const containerRef = useRef<HTMLDivElement>(null);

	const d = useDetailStore();

	const {scrollOffset, loading} = useSnapshot(d);


	const restoreScroll = useCallback(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = scrollOffset;
		}
	}, [scrollOffset]);

	// Persist only once scrolling settles; each write snapshots the whole detail store.
	const saveScrollOffset = useDebounce((top: number) => {
		d.scrollOffset = top;
	}, 150);

	useEffect(() => {
		restoreScroll();

		// Dockview keeps inactive tabs mounted rather than destroying them, so
		// this effect's mount only fires once; re-apply whenever this tab
		// becomes the active one again (switching away resets scrollTop
		// outside React, so there's nothing else to catch it).
		const disposeDidActiveChange = props.api.onDidActiveChange(() => {
			restoreScroll();
		});

		return () => {
			disposeDidActiveChange.dispose();
		};
	}, [entry, props.api, restoreScroll]);

	// While loading, content collapses to the small "Loading..." placeholder,
	// which shrinks scrollHeight and makes the browser clamp scrollTop to 0 -
	// firing a native scroll event that would otherwise stomp the saved
	// offset. Re-apply it once the real content is back.
	useEffect(() => {
		if (!loading) {
			restoreScroll();
		}
	}, [loading, restoreScroll]);

	// The panel opens with whatever title the opener had — often just the urn for a
	// bare link. Once the entry loads, retitle the tab from its real name.
	useEffect(() => {
		if (loading) {
			return;
		}
		const name = titleOf(d.entry);
		if (name) {
			props.api.setTitle(name);
		}
	}, [loading, d, props.api]);

	if (loading) {
		return (
			<div className="flex flex-col grow max-h-full overflow-auto">
				{/* Left empty because of flash, code too fast men */}
				{/* <div className={"flex flex-row gap-8 items-center"}>
					Loading...
				</div> */}
			</div>
		);
	}

	const DetailsComponent: ComponentType<IDockviewPanelProps> | undefined = (() => {
		switch (entry.type) {
			case SourceKind.Item:
				return DetailsItem;
			case SourceKind.GrindSpot:
				return GrindSpotDetails;
			case SourceKind.Npc:
				return NpcDetails;
			case SourceKind.Knowledge:
				return KnowledgeDetails;
			case SourceKind.Region:
				return RegionDetails;
			case SourceKind.Character:
				return CharacterDetails;
			default:
				return undefined;
		}
	})();

	return (
		<div
			className="flex flex-col grow max-h-full overflow-auto"
			ref={containerRef}
			data-panel={"detail"}
			data-source={entry.type}
			data-urn={entry.urn}
			onScroll={e => {
				if (d.loading) {
					return;
				}
				saveScrollOffset(e.currentTarget.scrollTop);
			}}
		>
			{DetailsComponent
				? <DetailsComponent {...props} />
				: (
					<div className={"flex flex-row gap-8 items-center"}>
						Unknown source: {entry.type} {"->"} {JSON.stringify(entry.value, null, 2)}
					</div>
				)}
		</div>
	);
}

export const DetailsPanel = (props: IDockviewPanelProps) => {
	const params = props.params as { key: string, source: SourceKind, urn?: string };

	const [entry, setEntry] = useState<UntypedSourceEntry>(() => ({
		type  : params.source,
		urn   : params.urn ?? "",
		value : params.key
	}));


	useEffect(() => {
		const disposeDidParametersChange = props.api.onDidParametersChange(event => {
			const newParams = event as { key: string, source: SourceKind, urn?: string };
			setEntry({type : newParams.source, urn : newParams.urn ?? "", value : newParams.key});
		});

		return () => {
			disposeDidParametersChange.dispose();
		};
	}, [props.api]);

	if (!props.params?.urn || !props.params?.source) {
		return (
			<div className="flex flex-col grow max-h-full h-full w-full items-center justify-center overflow-auto p-8">
				<p className={"text-fg text-lg"}>
					No source selected
				</p>
				<p className={"text-fg-subtle text-sm"}>
					Select a source to view details
				</p>
			</div>
		);
	}

	return (
		<DetailProvider entry={entry}>
			<DetailsPanelInner entry={entry} props={props} />
		</DetailProvider>
	);
};
