import {useSnapshot} from "valtio/react";
import {sources} from "@/state/sources/sources.ts";
import {navigation} from "@/state/navigation.tsx";
import {SidebarNode} from "@/components/sidebar/sidebar.tsx";

// The left nav panel: the multi-source navigation tree on its own. Tool shortcuts live
// in the rail, so this is purely the data hierarchy.
export function TreeNav() {
	const {loading}   = useSnapshot(sources);
	const {rootNodes} = useSnapshot(navigation);

	if (loading) {
		return <div className={"p-2 text-sm text-fg-subtle"}>Loading...</div>;
	}

	return (
		<div className={"flex flex-col py-1 overflow-y-auto h-full"} data-panel={"tree"}>
			{rootNodes.map(node => (
				<SidebarNode key={node.id} node={node} parent={node} depth={0} />
			))}
		</div>
	);
}
