import {proxy} from "valtio";
import {CharacterClassTypeInfo, SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetAllClasses, SetClass, Equip, Unequip, Upgrade, GetStats} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {ref} from "valtio/vanilla";
import {Events} from "@wailsio/runtime";
import {Slot, StatSheet, MasteryConfigSet} from "@bindings/bdo-viewer/internal/gear";
import {useSnapshot} from "valtio/react";


export const GearBuilderTabs = [
	{id : "combat", label : "Equipment"},
	{id : "life", label : "Life Tools"},
	{id : "settings", label : "Settings"},
] as const;

export class GearBuilderStore {
	public loading = true;

	public classes: CharacterClassTypeInfo[]            = [];
	public selectedClass: CharacterClassTypeInfo | null = null;

	private _slots: Slot[] = [];

	private _selectedSlot: SlotName | null = null;
	private _pickerSlot: SlotName | null   = null;

	public tab: typeof GearBuilderTabs[number]["id"] = "combat";

	public maxOnEquip: boolean          = false;
	public stats: StatSheet | undefined = undefined;

	public gearMastery: MasteryConfigSet | undefined = undefined;
	public level: number                             = 65;

	public onMount(): () => void {
		const offLoadoutUpdated = Events.On("gear-builder:loadout-updated", payload => {
			this.maxOnEquip    = payload.data.maxOnEquip;
			this.selectedClass = payload.data.class;
			this.gearMastery   = payload.data.gearMastery;
			this.level         = payload.data.level;
			this.slots         = payload.data.slots;
			// The backend recomputes stats for every change (slots, level, mastery,
			// class) and ships them in the event — use them directly, no re-fetch.
			this.stats         = payload.data.stats ?? undefined;
		});

		this.loading = true;

		this.loadClasses()
			.finally(() => {
				this.loading = false;
			});

		return () => {
			offLoadoutUpdated();
		};
	}

	public async loadClasses() {
		this.classes = ref(
			(await GetAllClasses())
				.filter(cls => !cls.Reserved)
				.sort((a, b) => a.Title.localeCompare(b.Title))
		);
	}

	public selectClass(cls: CharacterClassTypeInfo) {
		this.selectedClass = cls;
		void SetClass(cls.CharacterClassType);
	}

	public get slots(): Slot[] {
		return this._slots;
	}

	public set slots(slots: Slot[]) {
		this._slots = slots;
	}

	public get selectedSlot(): Slot | undefined {
		if (this._selectedSlot === null) {
			return undefined;
		}

		return this.slots[this._selectedSlot];
	}

	public set selectedSlot(slot: SlotName | null | undefined) {
		this._selectedSlot = slot;
	}

	public openPicker(slotId: SlotName) {
		this._pickerSlot   = slotId;
		this._selectedSlot = slotId;
	}

	public get pickerSlot(): Slot | undefined {
		if (this._pickerSlot === null) {
			return undefined;
		}

		return this.slots[this._pickerSlot];
	}

	public closePicker() {
		this._pickerSlot = null;
	}

	public async equip(slotId: SlotName, urn: string) {
		await Equip(slotId, urn);
	}

	public async unequip(slotId: SlotName) {
		await Unequip(slotId);
	}

	public async upgrade(slotId: SlotName, enhancement?: number, caphras?: number) {
		const slot = this.slots[slotId];
		if (!slot || !slot.item) {
			console.error("No item equipped in slot", slotId);
			return;
		}

		enhancement ??= slot.enhanceLevel;
		caphras ??= slot.caphrasLevel;


		await Upgrade(slotId, enhancement, caphras);
	}

	public async computeStats() {
		try {
			this.stats = await GetStats();
		} catch (error) {
			console.error("Error computing stats:", error);
		} finally {
		}
	}
}

export const gearBuilderStore = proxy(new GearBuilderStore());

let _gearBuilderStoreUnmount: (() => void) | null = null;

export function useGearBuilderStore() {
	if (!_gearBuilderStoreUnmount) {
		_gearBuilderStoreUnmount = gearBuilderStore.onMount();
	}
	const snap = useSnapshot(gearBuilderStore);

	return [snap, gearBuilderStore] as const;
}
