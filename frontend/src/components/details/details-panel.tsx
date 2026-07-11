import {IDockviewPanelProps} from "dockview-react";
import {DetailsItem} from "@/components/details/details-item.tsx";
import {DetailProvider, useDetail} from "@/state/detail.tsx";
import {SourceKind, UntypedSourceEntry} from "@bindings/bdo-viewer/internal/sources";
import {type ComponentType, useCallback, useEffect, useRef, useState} from "react";
import {GrindSpotDetails} from "@/components/details/details-grindspot.tsx";
import {NpcDetails} from "@/components/details/details-npc.tsx";
import {KnowledgeDetails} from "@/components/details/details-knowledge.tsx";
import {RegionDetails} from "@/components/details/details-region.tsx";
import {CharacterDetails} from "@/components/details/details-character.tsx";

function DetailsPanelInner({entry, props}: { entry: UntypedSourceEntry, props: IDockviewPanelProps }) {

	const containerRef = useRef<HTMLDivElement>(null);

	const [details, d] = useDetail();

	const restoreScroll = useCallback(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = details.scrollOffset;
		}
	}, [details]);

	useEffect(() => {
		restoreScroll();

		// Dockview keeps inactive tabs mounted rather than destroying them, so
		// this effect's mount only fires once; re-apply whenever this tab
		// becomes the active one again (switching away resets scrollTop
		// outside React, so there's nothing else to catch it).
		const disposeDidActiveChange = props.api.onDidActiveChange(event => {
			if (event.isActive) {
				restoreScroll();
			}
		});

		return () => {
			disposeDidActiveChange.dispose();
		};
	}, [entry, restoreScroll]);

	// While loading, content collapses to the small "Loading..." placeholder,
	// which shrinks scrollHeight and makes the browser clamp scrollTop to 0 -
	// firing a native scroll event that would otherwise stomp the saved
	// offset. Re-apply it once the real content is back.
	useEffect(() => {
		if (!d.loading) {
			restoreScroll();
		}
	}, [d.loading, restoreScroll]);

	if (d.loading) {
		return (
			<div className="flex flex-col grow max-h-full overflow-auto">
				<div className={"flex flex-row gap-8 items-center"}>
					Loading...
				</div>
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
				if (d.loading) return;
				details.scrollOffset = e.currentTarget.scrollTop;
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
		urn   : params.urn,
		value : params.key
	}));


	useEffect(() => {
		const disposeDidParametersChange = props.api.onDidParametersChange(event => {
			const newParams = event as { key: string, source: SourceKind, urn?: string };
			setEntry({type : newParams.source, urn : newParams.urn, value : newParams.key});
		});

		return () => {
			disposeDidParametersChange.dispose();
		};
	}, []);

	if(!props.params?.key || !props.params?.source || !props?.params?.urn) {
		return (
			<div className="flex flex-col grow max-h-full h-full w-full items-center justify-center overflow-auto p-8">
				<p className={"text-zinc-200 text-lg"}>
					No source selected
				</p>
				<p className={"text-zinc-400 text-sm"}>
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
