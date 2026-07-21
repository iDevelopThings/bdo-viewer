package gear

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/stats"
	"bdo-viewer/internal/util"
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

const (
	EventLoadoutUpdated        = "gear-builder:loadout-updated"
	EventSlotBlockStatusChange = "gear-builder:slot-block-status-change"
	EventEquipHistoryUpdated   = "gear-builder:equip-history-updated"
)

type EventLoadoutUpdatedPayload struct {
	GearMastery     MasteryConfigSet                  `json:"gearMastery"`
	Level           int                               `json:"level"`
	Consumables     []*model.Item                     `json:"consumables"`
	Crystals        []SimpleCrystalSlot               `json:"crystals"`
	CrystalGroups   []CrystalGroupUsage               `json:"crystalGroups"`
	CrystalEffects  []stats.StatGroup                 `json:"crystalEffects"`
	Class           model.CharacterClassTypeInfo      `json:"class,omitempty"`
	Slots           [model.SlotNameMAX]SimpleSlotData `json:"slots"`
	MaxOnEquip      bool                              `json:"maxOnEquip"`
	Stats           *StatSheet                        `json:"stats"`
}
type EventSlotBlockUpdatedPayload struct {
	SlotId       model.SlotName  `json:"slotId"`
	Locked       bool            `json:"locked"`
	LockedBy     *model.SlotName `json:"lockedBy"`
	PreviousItem *model.Item     `json:"previousItem,omitempty"`
}
type EventEquipHistoryUpdatedPayload struct {
	EquipHistory []sources.ListSourceEntry `json:"equipHistory,omitempty"`
}

// defaultLevel is the character level the stat pipeline assumes until the UI
// exposes a control for it (level is a constant offset for gear comparison).
const defaultLevel = 65

func init() {
	application.RegisterEvent[EventLoadoutUpdatedPayload](EventLoadoutUpdated)
	application.RegisterEvent[EventSlotBlockUpdatedPayload](EventSlotBlockStatusChange)
	application.RegisterEvent[EventEquipHistoryUpdatedPayload](EventEquipHistoryUpdated)
}

type MasteryData struct {
	Rank int `json:"rank"`
	Lvl  int `json:"lvl"`
}
type MasteryConfigSet map[model.LifeSkillType]MasteryData

type BuilderService struct {
	app *application.App
	ctx context.Context

	mu sync.Mutex
	db *util.Debouncer

	GearMastery MasteryConfigSet `json:"gearMastery"`

	// Consumables are the active food/draughts/perfumes/elixirs whose timed buffs
	// fold into the sheet, in activation order (the order matters: the client's
	// stacking rules let a later item clear/replace an earlier one — see
	// addConsumables). Deduped by URN so the exact same item can't stack.
	Consumables models.EntityRefList[model.Item] `json:"consumables"`

	// Crystals is the active transfusion preset (fixed socket layout).
	Crystals [model.CrystalPresetSlotMAX]CrystalSocket `json:"crystals"`

	Class model.CharacterClassType `json:"class"`
	Slots [model.SlotNameMAX]Slot  `json:"slots"`

	// Level and Fitness feed the stat pipeline. Not yet UI-exposed; Level
	// defaults to defaultLevel, Fitness to zero.
	Level   int     `json:"level"`
	Fitness Fitness `json:"fitness"`

	// If true, we automatically set the max enhancement level when equipping an item
	MaxOnEquip bool `json:"maxOnEquip"`

	// See this almost like an inventory, when you remove an item from a slot, we'll store it here
	// Useful when trying to compare things, and when an item gets de-equipped because of another consuming slots.
	EquipHistory []EquipHistoryEntry `json:"equipHistory"`

	// Set when a save exists but couldn't be read, which leaves this service holding defaults.
	// Saving then would write those defaults over a build we simply failed to parse.
	loadFailed bool
}

// EquipHistoryEntry keeps the slot the item came out of so re-equipping from the history
// panel can put it back where it was — an item's URN alone doesn't pin down one slot.
type EquipHistoryEntry struct {
	Item models.EntityRef[model.Item] `json:"item"`
	Slot model.SlotName               `json:"slot"`
}

var Service *BuilderService

func NewBuilderService() *BuilderService {
	Service = &BuilderService{
		db: util.NewDebouncer(500*time.Millisecond, func() {
			Service.SaveState()
		}),

		GearMastery: MasteryConfigSet{},

		Consumables:  models.NewEntityRefList[model.Item](),
		Crystals:     emptyCrystalPreset(),
		EquipHistory: []EquipHistoryEntry{},

		Slots: [model.SlotNameMAX]Slot{},
		Class: model.CharacterClassTypeUnknown,
		Level: defaultLevel,
	}

	for info := range model.SlotNames.All() {
		Service.Slots[info.Wire()] = Slot{
			BaseSlotData: BaseSlotData{
				Id: info,
			},
			Info: info.Info(),
		}
		Service.Slots[info.Wire()].Reset(SlotResetKindFull)
	}

	return Service
}

func (s *BuilderService) ServiceName() string { return "gear-builder" }

func (s *BuilderService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	s.app = application.Get()
	s.ctx = ctx

	return nil
}
func (s *BuilderService) ServiceShutdown() error {
	if s.Class != model.CharacterClassTypeUnknown {
		s.app.Logger.Info("Saving gear builder state on shutdown")
		s.SaveState()
	} else {
		s.app.Logger.Info("Not saving gear builder state on shutdown because no class is selected")
	}

	return nil
}

// EnteredBuilder Called by frontend when the user opens the builder panel
func (s *BuilderService) EnteredBuilder() {
	s.LoadState()
}

func (s *BuilderService) GetAllClasses() []model.CharacterClassTypeInfo {
	return model.CharacterClassTypes.Infos()
}

func (s *BuilderService) SetClass(class model.CharacterClassType) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.db.Trigger()

	s.Class = class

	s.emitLoadoutUpdated()
}

func (s *BuilderService) Equip(itemRef *models.EntityRef[model.Item], slotId model.SlotName) bool {
	item := itemRef.GetValue()
	if item == nil || item.EquipInfo == nil {
		return false
	}

	if !slotId.Valid() {
		return false
	}

	s.mu.Lock()
	if s.Slots[slotId].Locked {
		s.mu.Unlock()
		return false
	}

	if s.Slots[slotId].Item != nil && s.Slots[slotId].Item.ID != item.ID {
		s.unequipInternal(slotId)
	}

	slotsBlocked := s.equipInternal(slotId, item, itemRef)
	s.syncDawnCrystals()

	if len(slotsBlocked) > 0 {
		s.emitSlotBlockStatusChange(slotsBlocked)
	}
	s.emitLoadoutUpdated()

	s.mu.Unlock()
	s.db.Trigger()

	return true
}

// equipInternal handles the process without the locks and event emission.
func (s *BuilderService) equipInternal(slotId model.SlotName, item *model.Item, itemRef *models.EntityRef[model.Item]) []EventSlotBlockUpdatedPayload {
	s.Slots[slotId].ItemRef = itemRef
	s.Slots[slotId].Item = item

	if item.Enhancement != nil {
		if s.MaxOnEquip {
			s.Slots[slotId].EnhanceLevel = item.Enhancement.MaxLevel
		} else {
			s.Slots[slotId].EnhanceLevel = 0
		}
		s.Slots[slotId].Enhancement = item.FindEnchantLevel(s.Slots[slotId].EnhanceLevel)

		e := s.Slots[slotId].Enhancement

		if s.MaxOnEquip {
			s.Slots[slotId].CaphrasLevel = e.CaphrasMaxLevel
		} else {
			s.Slots[slotId].CaphrasLevel = e.CaphrasMinLevel
		}
		s.Slots[slotId].Caphras = e.GetCaphrasLevel(s.Slots[slotId].CaphrasLevel)
	} else {
		s.Slots[slotId].EnhanceLevel = 0
		s.Slots[slotId].Enhancement = nil

		s.Slots[slotId].CaphrasLevel = 0
		s.Slots[slotId].Caphras = nil
	}

	var slotsBlocked []EventSlotBlockUpdatedPayload
	if len(item.EquipInfo.Slots) > 0 {
		slotsBlocked = s.SetSlotsBlockStatus(item.EquipInfo.Slots, slotId, true)
	}

	return slotsBlocked
}

func (s *BuilderService) Unequip(slotId model.SlotName) bool {
	if !slotId.Valid() {
		return false
	}
	s.mu.Lock()
	if s.Slots[slotId].Locked {
		s.mu.Unlock()
		return false
	}

	slotsBlocked := s.unequipInternal(slotId)
	s.syncDawnCrystals()

	if len(slotsBlocked) > 0 {
		s.emitSlotBlockStatusChange(slotsBlocked)
	}
	s.emitLoadoutUpdated()

	s.mu.Unlock()
	s.db.Trigger()

	return true
}

// unequipInternal handles the process without the locks and event emission.
func (s *BuilderService) unequipInternal(slotId model.SlotName) []EventSlotBlockUpdatedPayload {
	item := s.Slots[slotId].Item

	var slotsBlocked []EventSlotBlockUpdatedPayload
	if item != nil {
		slotsBlocked = s.SetSlotsBlockStatus(item.EquipInfo.Slots, slotId, false)
	}

	s.Slots[slotId].Reset(SlotResetKindFull)

	if item != nil {
		s.addToEquipHistory(slotId, item)
	}

	return slotsBlocked
}

func (s *BuilderService) SetSlotsBlockStatus(slotsToBlock []model.SlotName, blocker model.SlotName, block bool) []EventSlotBlockUpdatedPayload {

	var slotsChanged []EventSlotBlockUpdatedPayload
	for _, slot := range slotsToBlock {
		if slot.Valid() && slot != blocker {

			prevItem := s.Slots[slot].Item

			// Clear any occupant before applying the lock: unequipInternal does a full reset,
			// which would otherwise wipe the lock fields we set below.
			if block && prevItem != nil {
				s.unequipInternal(slot)
			}

			s.Slots[slot].Locked = block
			if block {
				s.Slots[slot].LockedBy = &blocker
			} else {
				s.Slots[slot].LockedBy = nil
			}

			slotsChanged = append(slotsChanged, EventSlotBlockUpdatedPayload{
				SlotId:       slot,
				PreviousItem: prevItem,
				LockedBy:     &blocker,
				Locked:       block,
			})
		}
	}

	return slotsChanged
}

func (s *BuilderService) Upgrade(
	slotId model.SlotName,
	enhanceLevel int,
	caphrasLevel int,
) bool {

	if !slotId.Valid() {
		return false
	}

	s.mu.Lock()
	slot := &s.Slots[slotId]
	if slot.Locked || slot.Item == nil {
		s.mu.Unlock()
		return false
	}

	prevEnhanceLevel := slot.EnhanceLevel
	prevCaphrasLevel := slot.CaphrasLevel

	applyEnhancementLevels(slot, enhanceLevel, caphrasLevel)

	if prevEnhanceLevel != slot.EnhanceLevel || prevCaphrasLevel != slot.CaphrasLevel {
		s.emitLoadoutUpdated()
	}

	s.mu.Unlock()
	s.db.Trigger()

	return true
}

func applyEnhancementLevels(slot *Slot, enhanceLevel int, caphrasLevel int) {
	if slot.Item == nil {
		return
	}
	item := slot.Item

	eLevel := item.ClampEnhanceLevel(enhanceLevel)
	enhancement := item.FindEnchantLevel(eLevel)

	slot.EnhanceLevel = eLevel
	slot.Enhancement = enhancement

	if enhancement != nil {
		slot.CaphrasLevel = min(max(caphrasLevel, enhancement.CaphrasMinLevel), enhancement.CaphrasMaxLevel)
		slot.Caphras = enhancement.GetCaphrasLevel(slot.CaphrasLevel)
	}
}

// computeStats runs the stat pipeline for the current loadout. The caller must
// hold s.mu.
func (s *BuilderService) computeStats() *StatSheet {
	return ComputeStats(s.Class, s.Level, s.Fitness, s.playerMastery(), s.Slots[:], s.activeConsumables(), s.activeCrystals())
}

// activeConsumables resolves the active consumable refs to their items, in
// activation order (nil-resolving entries dropped).
func (s *BuilderService) activeConsumables() []*model.Item {
	all := s.Consumables.All()
	items := make([]*model.Item, 0, len(all))
	for _, it := range all {
		if it != nil {
			items = append(items, it)
		}
	}
	return items
}

// playerMastery converts the typed per-life-skill gear mastery into the
// accumulator's MasterySet (mastery StatId -> rank+level) via each skill's
// MasteryStat. Skills without a gear mastery (Bartering, Quest) are skipped.
func (s *BuilderService) playerMastery() MasterySet {
	out := make(MasterySet, len(s.GearMastery))
	for skill, r := range s.GearMastery {
		if stat := skill.MasteryStat(); stat != "" {
			out[stat] = Mastery{Rank: r.Rank, Lvl: r.Lvl}
		}
	}
	return out
}

// GetStats returns the computed stat sheet for the current loadout.
func (s *BuilderService) GetStats() *StatSheet {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.computeStats()
}

// GetEquipHistory intentionally has no lock so it can be used inside lock-protected code paths (like equip/unequip) without deadlocking.
func (s *BuilderService) getEquipHistory() []sources.ListSourceEntry {
	history := make([]sources.ListSourceEntry, 0, len(s.EquipHistory))
	for _, entry := range s.EquipHistory {
		if it := entry.Item.GetValue(); it != nil {
			history = append(history, sources.ListSourceEntry{
				URN:   it.GetURN().String(),
				Title: it.Name,
				Icon:  it.Icon,
				Extra: map[string]any{
					"grade": it.Grade,
					"slot":  entry.Slot,
				},
			})
		}
	}

	return history
}

func (s *BuilderService) GetEquipHistory() []sources.ListSourceEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.getEquipHistory()
}

func (s *BuilderService) ToggleMaxOnEquip() {
	s.updateAndEmit(func() {
		s.MaxOnEquip = !s.MaxOnEquip
	})
}

func (s *BuilderService) UpdateMasteryConfig(data MasteryConfigSet) {
	s.updateAndEmit(func() {
		s.GearMastery = data
	})
}

// SetLevel sets the character level the stat pipeline assumes (clamped to >=1)
// and persists it.
func (s *BuilderService) SetLevel(level int) {
	s.updateAndEmit(func() {
		s.Level = max(1, level)
	})
}

// AddConsumable activates a consumable buff (idempotent by URN — the exact same
// item can't stack, distinct consumables can). Returns false for an unresolvable
// or non-consumable item.
func (s *BuilderService) AddConsumable(itemRef *models.EntityRef[model.Item]) bool {
	if itemRef == nil {
		return false
	}
	item := itemRef.GetValue()
	if item == nil || item.Effects == nil {
		return false
	}
	if s.Consumables.Contains(itemRef.URN) {
		return true // already active (deduped by URN)
	}
	s.updateAndEmit(func() {
		// Using this item clears active consumables whose broad family it removes
		// (a draught clears other draughts, etc.), so they drop out of the set —
		// not just resolved away at compute time — and the frontend reflects it.
		for _, u := range s.consumablesClearedBy(item) {
			s.Consumables.Remove(u)
		}
		s.Consumables.Add(itemRef.URN)
	})
	return true
}

// consumablesClearedBy returns the URNs of active consumables whose broad buff
// family (BuffCategory) is listed in the given item's ClearsBuffCategories.
func (s *BuilderService) consumablesClearedBy(item *model.Item) []urn.URN {
	if item.Effects == nil || len(item.Effects.ClearsBuffCategories) == 0 {
		return nil
	}
	clears := item.Effects.ClearsBuffCategories
	var out []urn.URN
	for i, u := range s.Consumables.URNs {
		if active := s.Consumables.Get(i); consumableInCategories(active, clears) {
			out = append(out, u)
		}
	}
	return out
}

// consumableInCategories reports whether any of the item's effect stats belongs
// to one of the given broad buff families.
func consumableInCategories(item *model.Item, cats []model.BuffStackingCategory) bool {
	if item == nil || item.Effects == nil {
		return false
	}
	for _, sm := range item.Effects.Stats.Stats {
		if sm.BuffCategory != 0 && slices.Contains(cats, sm.BuffCategory) {
			return true
		}
	}
	return false
}

// RemoveConsumable deactivates a consumable by its item URN.
func (s *BuilderService) RemoveConsumable(urnStr string) {
	u, err := urn.Parse(urnStr)
	if err != nil {
		return
	}
	s.updateAndEmit(func() {
		s.Consumables.Remove(u)
	})
}

func (s *BuilderService) addToEquipHistory(slotId model.SlotName, item *model.Item) {
	if item == nil {
		return
	}

	s.EquipHistory = slices.DeleteFunc(s.EquipHistory, func(entry EquipHistoryEntry) bool {
		return entry.Item.URN == item.GetURN()
	})
	s.EquipHistory = append([]EquipHistoryEntry{{
		Item: *item.ToEntityRef(),
		Slot: slotId,
	}}, s.EquipHistory...)

	if len(s.EquipHistory) > 30 {
		s.EquipHistory = s.EquipHistory[:30]
	}

	if len(s.EquipHistory) > 0 {
		s.app.Event.Emit(EventEquipHistoryUpdated, EventEquipHistoryUpdatedPayload{
			EquipHistory: s.getEquipHistory(),
		})
	}
}

func (s *BuilderService) emitSlotBlockStatusChange(slots []EventSlotBlockUpdatedPayload) {
	for _, slot := range slots {
		s.app.Event.Emit(EventSlotBlockStatusChange, slot)
	}
}

func (s *BuilderService) emitLoadoutUpdated() {
	slots := [model.SlotNameMAX]SimpleSlotData{}

	for i, slot := range s.Slots {
		slots[i] = s.buildSimpleSlotData(slot)
	}

	s.app.Event.Emit(EventLoadoutUpdated, EventLoadoutUpdatedPayload{
		GearMastery:    s.GearMastery,
		Level:          s.Level,
		Consumables:    s.activeConsumables(),
		Crystals:       s.simpleCrystalSlots(),
		CrystalGroups:  s.crystalGroupUsage(),
		CrystalEffects: stats.NewStatBuilder().ExtendCrystalPreset(s.activeCrystals()).Build(),
		Class:          s.Class.Info(),
		Slots:          slots,
		MaxOnEquip:     s.MaxOnEquip,
		Stats:          s.computeStats(),
	})
}

func (s *BuilderService) buildSimpleSlotData(slot Slot) SimpleSlotData {
	d := SimpleSlotData{
		BaseSlotData: slot.BaseSlotData,
		Info:         slot.Info,
	}

	if slot.Item != nil {
		if slot.Enhancement != nil {
			d.EnhancementTitle = slot.Enhancement.Name
			d.EnhancementMinLevel = slot.Item.Enhancement.MinLevel
			d.EnhancementMaxLevel = slot.Item.Enhancement.MaxLevel
			if slot.Caphras != nil {
				d.CaphrasMinLevel = slot.Enhancement.CaphrasMinLevel
				d.CaphrasMaxLevel = slot.Enhancement.CaphrasMaxLevel
			}
		}
		d.ItemRef = model.ItemRef(slot.Item.ID)
		d.Item = &sources.ListSourceEntry{
			URN:   slot.Item.GetURN().String(),
			Title: slot.Item.Name,
			Icon:  slot.Item.Icon,
			Extra: map[string]any{
				"grade": slot.Item.Grade,
			},
		}
	}

	return d
}
