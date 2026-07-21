import {proxy} from "valtio";
import type {CharacterClassType, CharacterClassTypeInfo, Item, SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GetAllClasses, SetClass, Equip, Unequip, Upgrade, ToggleMaxOnEquip, GetEquipHistory} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {ref} from "valtio/vanilla";
import {Events} from "@wailsio/runtime";
import type {SimpleSlotData as Slot, MasteryConfigSet} from "@bindings/bdo-viewer/internal/gear";
import {useSnapshot} from "valtio/react";
import {useEffect} from "react";
import {batch} from "valtio-reactive";
import type {StatSheet, SimpleCrystalSlot, CrystalGroupUsage} from "@bindings/bdo-viewer/internal/gear/models.ts";
import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import type {ListSourceEntry} from "@bindings/bdo-viewer/internal/sources";

type HighlightSlot = { highlighter: SlotName, highlightee: SlotName, reason: "locker" | "locked" };

// Safe as a value compare because both sides are the same backend struct, so key order matches.
function slotsEqual(a: Slot, b: Slot): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export class GearBuilderStore {
	public loading = true;

	public classes: CharacterClassTypeInfo[]                        = [];
	public selectedClass: CharacterClassTypeInfo | null | undefined = null;

	private _slots: Slot[] = [];

	private _selectedSlot: SlotName | null = null;

	public maxOnEquip: boolean          = false;
	public stats: StatSheet | undefined = undefined;

	public gearMastery: MasteryConfigSet | undefined = undefined;
	public level: number                             = 65;
	public consumables: (Item | null)[]              = [];
	public crystals: SimpleCrystalSlot[]             = [];
	public crystalGroups: CrystalGroupUsage[]        = [];
	public crystalEffects: StatGroup[]               = [];

	// Keyed by highlighter slot so each gear slot subscribes to only its own key.
	public highlightSlots: Partial<Record<SlotName, HighlightSlot>> = {};
	public gearHistory: ListSourceEntry[]                           = [];

	public onMount(): () => void {
		const offLoadoutUpdated = Events.On("gear-builder:loadout-updated", payload => {
			batch(() => {
				this.maxOnEquip    = payload.data.maxOnEquip;
				this.selectedClass = payload.data.class;
				this.gearMastery   = payload.data.gearMastery;
				this.level         = payload.data.level;
				this.consumables   = payload.data.consumables ?? [];
				this.crystals        = payload.data.crystals ? ref(payload.data.crystals) : [];
				this.crystalGroups   = payload.data.crystalGroups ? ref(payload.data.crystalGroups) : [];
				this.crystalEffects  = payload.data.crystalEffects ? ref(payload.data.crystalEffects) : [];
				this.reconcileSlots(payload.data.slots);
				this.stats = payload.data.stats ? ref(payload.data.stats) : undefined;
			});
		});

		const offSlotLockChange = Events.On("gear-builder:slot-block-status-change", payload => {
			const changed = payload.data.slotId;
			for (const [key, h] of Object.entries(this.highlightSlots)) {
				if (h.highlighter === changed || h.highlightee === changed) {
					delete this.highlightSlots[key as unknown as SlotName];
				}
			}
		});


		const offHistoryUpdated = Events.On("gear-builder:equip-history-updated", payload => {
			this.gearHistory = payload.data.equipHistory ? ref(payload.data.equipHistory) : [];
		});



		this.loading = true;

		this.load().finally(() => {
			this.loading = false;
		});

		return () => {
			offLoadoutUpdated();
			offSlotLockChange();
			offHistoryUpdated();
		};
	}

	public async load() {
		this.classes = ref(
			(await GetAllClasses() ?? [])
				.filter(cls => !cls.Reserved)
				.sort((a, b) => a.Title.localeCompare(b.Title))
		);

		// Seed history once; equip-history-updated keeps it current after.
		const hist       = await GetEquipHistory();
		this.gearHistory = hist ? ref(hist) : [];
	}

	public selectClass(cls: CharacterClassTypeInfo) {
		this.selectedClass = cls;
		void SetClass(cls.CharacterClassType);
	}

	public get slots(): Slot[] {
		return this._slots;
	}

	// The backend re-emits the whole loadout on any change; replace only the slots that actually
	// differ so unchanged slots keep their identity and don't re-render. ref() avoids deep-proxying.
	private reconcileSlots(next: Slot[]) {
		const cur = this._slots;
		if (cur.length !== next.length) {
			cur.length = next.length;
		}
		for (let i = 0; i < next.length; i++) {
			if (!cur[i] || !slotsEqual(cur[i], next[i])) {
				cur[i] = ref(next[i]);
			}
		}
	}

	public get selectedSlot(): Slot | undefined {
		if (this._selectedSlot === null) {
			return undefined;
		}

		return this.slots[this._selectedSlot];
	}

	public set selectedSlot(slot: SlotName | null | undefined) {
		this._selectedSlot = slot ?? null;
	}

	public async equip(urn: string, slot: SlotName) {
		await Equip(urn, slot);
	}

	public async unequip(slotId: SlotName) {
		await Unequip(slotId);
	}

	public async upgrade(slotId: SlotName, enhancement?: number, caphras?: number) {
		const slot = this.slots[slotId];
		// A slot may be missing/empty at runtime even though the type says every slot is present.
		if (!slot || !slot.item) {
			console.error("No item equipped in slot", slotId);
			return;
		}

		enhancement ??= slot.enhanceLevel;
		caphras ??= slot.caphrasLevel;


		await Upgrade(slotId, enhancement, caphras);
	}

	public clearClass() {
		this.selectedClass = null;
		// The binding types the param non-null, but clearing sends null (Go's zero value).
		void SetClass(null as unknown as CharacterClassType);
	}

	public toggleMaxOnEquip() {
		this.maxOnEquip = !this.maxOnEquip;
		void ToggleMaxOnEquip();
	}

	public setHoverState(slot: SlotName, lockedBy: SlotName, hovered: boolean, locked: HighlightSlot["reason"]): void {
		if (!hovered) {
			delete this.highlightSlots[lockedBy];
			return;
		}

		this.highlightSlots[lockedBy] = {highlighter : lockedBy, highlightee : slot, reason : locked};
	}
}

export const gearBuilderStore = proxy(new GearBuilderStore());

// if (import.meta.env?.DEV) {
// 	void connectReduxDevtools(gearBuilderStore, {name : "Gear Builder State"});
// }

// Mounted once for the app's lifetime (the store is a singleton). Kept in a module var so an HMR
// reload can dispose the old event subscriptions instead of stacking a fresh set on top.
let _gearBuilderStoreUnmount: (() => void) | null = null;

function ensureGearBuilderMounted() {
	if (!_gearBuilderStoreUnmount) {
		_gearBuilderStoreUnmount = gearBuilderStore.onMount();
	}
}


if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		_gearBuilderStoreUnmount?.();
		_gearBuilderStoreUnmount = null;
	});
}

export function useGearBuilderStore() {
	useEffect(ensureGearBuilderMounted, []);
	const snap = useSnapshot(gearBuilderStore);

	return [snap, gearBuilderStore] as const;
}
