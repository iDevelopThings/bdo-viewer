import type {WrappedWorldNode} from "@/components/world-map/world-node.ts";
import type {NpcMarker} from "@/components/world-map/types.ts";
import {npcRoleLabels} from "@/components/world-map/npc-roles.ts";

const MAX_PRODUCTS = 8;

function row(label: string, value: string): string {
	return `<div class="flex justify-between gap-3">
		<span class="text-fg-subtle">${label}</span>
		<span class="text-fg">${value}</span>
	</div>`;
}

function productList(n: WrappedWorldNode): string {
	const products = n.productItems();
	if (!products.length) {
		return "";
	}

	const shown = products.slice(0, MAX_PRODUCTS).map(i => `
		<div class="flex items-center gap-1 rounded bg-surface-3/50 py-0.5 pl-1 pr-1.5">
			<img src="${i.icon}" alt="" class="h-4 w-4" />
			<span class="text-fg-muted">${i.name}</span>
		</div>`).join("");

	const more = products.length > MAX_PRODUCTS
		? `<span class="self-center text-fg-subtle">+${products.length - MAX_PRODUCTS} more</span>`
		: "";

	return `
		<div class="mt-1.5 flex flex-col gap-1 border-t border-surface-border pt-1.5">
			<span class="text-fg-subtle">Products (${products.length})</span>
			<div class="flex flex-wrap gap-1">${shown}${more}</div>
		</div>`;
}

/** The tooltip shell. Deck applies its default tooltip styling inline (which would beat our
 *  classes), so `style` clears those and the markup carries the real styling. */
function card(body: string) {
	return {
		html  : `
			<div class="flex w-max max-w-80 flex-col gap-1 rounded-md border border-surface-border/70 bg-surface-1/95 px-2.5 py-2 text-xs shadow-lg">
				${body}
			</div>`,
		style : {
			background : "none",
			padding    : "0",
			margin     : "0",
			color      : "inherit",
			fontSize   : "inherit",
			maxWidth   : "none",
		},
	};
}

/** Hover card for an NPC marker: who they are, and either the node they manage or where they
 *  stand and what services they offer. */
export function npcTooltip(m: NpcMarker) {
	const roles = npcRoleLabels(m.spawnTypes).join(", ");

	return card(`
		<div class="flex items-baseline gap-1.5">
			<span class="font-semibold text-fg">${m.name}</span>
			${m.title ? `<span class="text-fg-subtle">${m.title}</span>` : ""}
		</div>
		${m.nodeName ? row(m.role, m.nodeName) : ""}
		${m.regionName ? row("Location", m.regionName) : ""}
		${roles ? row("Roles", roles) : ""}
		<span class="text-fg-subtle">Click to open</span>
	`);
}

/** Hover card for a node — deck writes it straight to the DOM, so it costs no React render. */
export function nodeTooltip(n: WrappedWorldNode) {
	const manager = n.managerNpc();
	const rep     = n.representativeNpc();

	const rows = [
		n.territoryName ? row("Territory", n.territoryName) : "",
		n.cp > 0 ? row("Contribution", `${n.cp} CP`) : "",
		n.main && n.totalCP() > n.cp ? row("With sub-nodes", `${n.totalCP()} CP`) : "",
		manager ? row("Node manager", manager.name) : "",
		rep ? row("Representative", rep.name) : "",
		n.main && n.productionChildren().length ? row("Production", n.productionChildren().map(c => c.kindLabel).join(", ")) : "",
	].join("");

	return card(`
		<div class="flex items-baseline gap-1.5">
			<span class="font-semibold text-fg">${n.name}</span>
			<span class="text-fg-subtle">${n.kindLabel}</span>
		</div>
		${rows}
		${productList(n)}
	`);
}
