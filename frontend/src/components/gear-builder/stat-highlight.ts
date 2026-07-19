// Cross-component stat highlighting driven entirely by one injected CSS rule, so
// hovering a gear slot / consumable can light up the stat rows it feeds WITHOUT
// any React state change or re-render. Stat rows carry a static `data-hl-src` of
// the item URNs that contribute to them; this swaps a single <style>'s text to
// target the hovered URN.

let styleEl: HTMLStyleElement | null = null;

// setHighlightSource highlights every stat row whose data-hl-src lists urn. Pass
// null to clear. Cheap: it only rewrites one <style> element's text content.
export function setHighlightSource(urn: string | null): void {
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.dataset.statHighlight = "";
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = urn
		? `[data-hl-src~="${urn}"]{background-color:rgba(234,179,8,0.12);box-shadow:inset 3px 0 0 rgb(234,179,8);}`
		: "";
}
