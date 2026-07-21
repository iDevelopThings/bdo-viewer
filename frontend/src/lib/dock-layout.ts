import type {DockviewApi, DockviewIDisposable as IDisposable} from "dockview-react";

// Dockview hardcodes `Sizing.Distribute` when a group joins or leaves the grid, so opening or closing
// any panel re-splits the row evenly and the pinned panels drift.
//
// pinWidths puts them back, leaving the unpinned groups to absorb the difference. Scoped to group
// add/remove on purpose: a container resize takes a different path in dockview (proportional
// rescale, no layout event, handled from its own rAF) and correcting that too means fighting live
// sash drags.
export function pinWidths(api: DockviewApi, panelIds: readonly string[]): IDisposable {
	const widths  = new Map<string, number>();
	let signature = groupSignature(api);

	// Merge rather than replace: a pinned panel that is currently closed must keep its remembered
	// width so re-opening it restores the same size instead of an even split.
	function record() {
		for (const id of panelIds) {
			const width = api.getPanel(id)?.api.width;
			if (width) {
				widths.set(id, width);
			}
		}
	}

	function restore() {
		for (const id of panelIds) {
			const width = widths.get(id);
			const panel = api.getPanel(id);
			if (width && panel && Math.round(panel.api.width) !== Math.round(width)) {
				panel.api.setSize({width});
			}
		}
	}

	record();

	// onDidLayoutChange is microtask-buffered (AsapEvent), so restore() lands before paint and its
	// own resize arrives as a later, coalesced event rather than re-entering this handler.
	return api.onDidLayoutChange(() => {
		const next = groupSignature(api);
		// Same groups as last time means a sash drag or a window resize: that width is the user's
		// intent, so adopt it. A changed set means dockview just redistributed, so undo it.
		if (next === signature) {
			record();
			return;
		}

		signature = next;
		restore();
	});
}

function groupSignature(api: DockviewApi): string {
	return api.groups.map(g => g.id).sort().join(",");
}
