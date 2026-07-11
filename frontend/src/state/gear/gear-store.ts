import {ref} from "valtio/vanilla";
import {GetItemsByURN, Item as GetItem} from "@bindings/bdo-viewer/internal/catalog/catalog.ts";
import {EnchantLevel, Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GEAR_SLOTS, type GearGroupId} from "@/state/gear/gear-slots.ts";
import {ItemURN} from "@/lib/urn.ts";

export type EquippedSlot = { itemId?: number; level: number };

function emptySlots(): Record<string, EquippedSlot> {
	return Object.fromEntries(GEAR_SLOTS.map(s => [s.id, {itemId : undefined, level : 0}]));
}

export class GearBuildStore {
	public buildId: string;
	public name: string = "New Build";
	public characterClass: string | undefined = undefined;
	public slots: Record<string, EquippedSlot> = emptySlots();
	public activeGroup: GearGroupId = "combat";
	public loading: boolean = false;

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
		this.slots        = {...emptySlots(), ...this.slots};
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
			for (const slot of Object.values(this.slots)) {
				if (slot.itemId !== undefined && cache[slot.itemId]) {
					slot.level = this.clampLevel(cache[slot.itemId], slot.level);
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
				slot.itemId = undefined;
				slot.level  = 0;
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
		slot.level  = this.clampLevel(item, slot.level);
	}

	public unequip(slotId: string) {
		const slot  = this.slots[slotId];
		slot.itemId = undefined;
		slot.level  = 0;
	}

	public setLevel(slotId: string, level: number) {
		const slot = this.slots[slotId];
		slot.level = this.clampLevel(this.itemFor(slotId), level);
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
