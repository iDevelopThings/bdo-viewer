import {ref} from "valtio/vanilla";
import {GetItemsByURN, Item as GetItem} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import {CaphrasLevel, EnchantLevel, Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GEAR_SLOTS, type GearGroupId} from "@/state/gear/gear-slots.ts";
import {ItemURN} from "@/lib/urn.ts";

// level is the enhancement level; caphras is the Caphras step (only meaningful at
// the enchant levels Caphras applies to — TRI/TET/PEN — and 0 otherwise).
export type EquippedSlot = { itemId?: number; level: number; caphras: number };

function emptySlot(): EquippedSlot {
	return {itemId : undefined, level : 0, caphras : 0};
}

function emptySlots(): Record<string, EquippedSlot> {
	return Object.fromEntries(GEAR_SLOTS.map(s => [s.id, emptySlot()]));
}

export class GearBuildStore {
	public buildId: string;
	public name: string = "New Build";
	public characterClass: string | undefined = undefined;
	public slots: Record<string, EquippedSlot> = emptySlots();
	public activeGroup: GearGroupId = "combat";
	public loading: boolean = false;

	// When set, equipping an item jumps it straight to max enhancement + max Caphras.
	// Persisted so the preference sticks across sessions.
	public maxOnEquip: boolean = false;

	// Transient UI state - not serialized.
	public pickerSlot: string | undefined = undefined;
	public selectedSlot: string | undefined = undefined;

	// Hydrated Item cache, entries ref()-wrapped so valtio doesn't deep-proxy them.
	private _items: Record<number, Item> = {};

	public constructor(buildId: string) {
		this.buildId = buildId;
	}

	// Called by the provider's merge strategy after a restore from storage.
	// Runs before the store is proxied, so it must stay synchronous - the
	// provider triggers hydrate() on the proxied store after mount.
	public postLoad() {
		this.pickerSlot   = undefined;
		this.selectedSlot = undefined;
		this.loading      = false;

		// Rebuild from a full empty set so new slots appear, and normalize each
		// restored slot — pre-Caphras saves have no `caphras` field.
		const slots = emptySlots();
		for (const [id, slot] of Object.entries(this.slots)) {
			if (slots[id]) {
				slots[id] = {itemId : slot.itemId, level : slot.level ?? 0, caphras : slot.caphras ?? 0};
			}
		}
		this.slots = slots;
	}

	public async hydrate() {
		const ids = [...new Set(
			Object.values(this.slots)
				.map(s => s.itemId)
				.filter((id): id is number => id !== undefined)
		)];
		if (ids.length === 0) {
			return;
		}

		this.loading = true;
		try {
			const items = await GetItemsByURN(ids.map(id => ItemURN.new(id)));

			const cache: Record<number, Item> = {};
			for (const item of items) {
				if (item) {
					cache[item.id] = ref(item);
				}
			}
			this._items = cache;

			// A missing item just stays unhydrated (renders as empty) - never
			// clear the stored id over what may be a transient lookup failure.
			for (const [id, slot] of Object.entries(this.slots)) {
				if (slot.itemId !== undefined && cache[slot.itemId]) {
					slot.level   = this.clampLevel(cache[slot.itemId], slot.level);
					slot.caphras = Math.min(slot.caphras, this.maxCaphrasFor(id));
				}
			}
		} catch (error) {
			console.error("GearBuildStore: failed to hydrate items", error);
		} finally {
			this.loading = false;
		}
	}

	public setClass(cls: string) {
		this.characterClass = cls;

		for (const slot of Object.values(this.slots)) {
			if (slot.itemId === undefined)
				continue;
			const item = this._items[slot.itemId];
			if (item?.classes?.length && !item.classes.includes(cls)) {
				slot.itemId  = undefined;
				slot.level   = 0;
				slot.caphras = 0;
			}
		}
	}

	public selectSlot(slotId: string) {
		this.selectedSlot = slotId;
	}

	public openPicker(slotId: string) {
		this.pickerSlot   = slotId;
		this.selectedSlot = slotId;
	}

	public closePicker() {
		this.pickerSlot = undefined;
	}

	public async equip(slotId: string, itemId: number) {
		let item = this._items[itemId];
		if (!item) {
			const fetched = await GetItem(ItemURN.new(itemId));
			if (!fetched) {
				console.error("GearBuildStore: item not found", itemId);
				return;
			}
			item        = ref(fetched);
			this._items = {...this._items, [itemId] : item};
		}

		const slot  = this.slots[slotId];
		slot.itemId = itemId;
		if (this.maxOnEquip) {
			// itemId is set, so maxLevelFor/maxCaphrasFor resolve against this slot;
			// set the level first since the Caphras cap depends on it.
			slot.level   = this.maxLevelFor(slotId);
			slot.caphras = this.maxCaphrasFor(slotId);
		} else {
			slot.level   = this.clampLevel(item, slot.level);
			slot.caphras = Math.min(slot.caphras, this.maxCaphrasFor(slotId));
		}
	}

	public unequip(slotId: string) {
		const slot   = this.slots[slotId];
		slot.itemId  = undefined;
		slot.level   = 0;
		slot.caphras = 0;
	}

	public setLevel(slotId: string, level: number) {
		const slot   = this.slots[slotId];
		slot.level   = this.clampLevel(this.itemFor(slotId), level);
		// Caphras only applies at TRI/TET/PEN, so re-clamp it whenever the level moves.
		slot.caphras = Math.min(slot.caphras, this.maxCaphrasFor(slotId));
	}

	public setCaphras(slotId: string, caphras: number) {
		const slot   = this.slots[slotId];
		slot.caphras = Math.max(0, Math.min(this.maxCaphrasFor(slotId), Math.round(caphras)));
	}

	public itemFor(slotId: string): Item | undefined {
		const itemId = this.slots[slotId]?.itemId;
		return itemId !== undefined ? this._items[itemId] : undefined;
	}

	public enchantFor(slotId: string): EnchantLevel | undefined {
		const item = this.itemFor(slotId);
		const slot = this.slots[slotId];
		return item?.enhancement?.levels?.find(l => l.level === slot.level);
	}

	// caphrasFor is the Caphras step the slot is currently at (its total added stats),
	// or undefined at step 0 / a level without Caphras.
	public caphrasFor(slotId: string): CaphrasLevel | undefined {
		const slot = this.slots[slotId];
		if (!slot?.caphras) {
			return undefined;
		}
		return this.enchantFor(slotId)?.caphras?.find(c => c.level === slot.caphras);
	}

	// maxCaphrasFor is the highest Caphras step at the slot's current enhance level
	// (0 unless it's a Caphras-enhanceable level — TRI/TET/PEN).
	public maxCaphrasFor(slotId: string): number {
		const caphras = this.enchantFor(slotId)?.caphras;
		return caphras?.length ? Math.max(...caphras.map(c => c.level)) : 0;
	}

	public minLevelFor(slotId: string): number {
		const levels = this.itemFor(slotId)?.enhancement?.levels;
		return levels?.length ? levels[0].level : 0;
	}

	public maxLevelFor(slotId: string): number {
		const levels = this.itemFor(slotId)?.enhancement?.levels;
		return levels?.length ? levels[levels.length - 1].level : 0;
	}

	private clampLevel(item: Item | undefined, level: number): number {
		const levels = item?.enhancement?.levels;
		if (!levels?.length) {
			return 0;
		}
		return Math.max(levels[0].level, Math.min(levels[levels.length - 1].level, level));
	}
}
