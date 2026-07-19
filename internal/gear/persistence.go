package gear

import (
	"fmt"

	"bdo-viewer/internal/config"
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

const (
	// PersistedStateVersion is the version of the persisted state. We bump this when we change the structure of the persisted state.
	PersistedStateVersion = 1
)

type PersistedState struct {
	BuildName string `json:"buildName"`
	Version   int    `json:"version"`

	GearMastery MasteryConfigSet                 `json:"gearMastery"`
	Level       int                              `json:"level"`
	Consumables models.EntityRefList[model.Item] `json:"consumables"`
	Class       model.CharacterClassType         `json:"class"`
	Slots       [model.SlotNameMAX]BaseSlotData  `json:"slots"`

	MaxOnEquip   bool                           `json:"maxOnEquip"`   // If true, we automatically set the max enhancement level when equipping an item
	EquipHistory []models.EntityRef[model.Item] `json:"equipHistory"` // The history of equipped items
}

func (s *BuilderService) update(f func()) {
	s.mu.Lock()
	f()
	s.mu.Unlock()
	s.db.Trigger()
}

// updateAndEmit is update plus a loadout event, with the emit inside the lock so
// it can't race Equip/Upgrade (which mutate s.Slots under the same lock).
func (s *BuilderService) updateAndEmit(f func()) {
	s.mu.Lock()
	f()
	s.emitLoadoutUpdated()
	s.mu.Unlock()
	s.db.Trigger()
}

func (s *BuilderService) SaveState() {
	s.mu.Lock()

	state := PersistedState{
		BuildName:    "My Build",
		Version:      PersistedStateVersion,
		GearMastery:  s.GearMastery,
		Level:        s.Level,
		Consumables:  s.Consumables,
		Class:        s.Class,
		Slots:        [model.SlotNameMAX]BaseSlotData{},
		MaxOnEquip:   s.MaxOnEquip,
		EquipHistory: s.EquipHistory,
	}

	for i, slot := range s.Slots {
		state.Slots[i] = slot.BaseSlotData
	}

	s.mu.Unlock()

	if err := config.WriteJsonConfig(&state, "gear-builder-state.json"); err != nil {
		s.app.Logger.Error(fmt.Sprintf("Failed to save gear builder state: %v", err))
	} else {
		s.app.Logger.Info("Saved gear builder state")
	}
}
func (s *BuilderService) LoadState() {
	state, err := config.ReadJsonConfig[PersistedState]("gear-builder-state.json")
	if err != nil {
		s.app.Logger.Error(fmt.Sprintf("Failed to load gear builder state: %v", err))
		return
	}
	// Potentially we don't have any state saved yet, so we just return and let the user start fresh
	if state == nil {
		return
	}

	if state.Version != PersistedStateVersion {
		s.app.Logger.Warn(fmt.Sprintf("Gear builder state version mismatch: %d != %d", state.Version, PersistedStateVersion))
		return
	}

	s.db.Suppress(true)
	defer s.db.Suppress(false)

	{
		s.mu.Lock()
		defer s.mu.Unlock()

		s.GearMastery = state.GearMastery
		s.Class = state.Class
		s.MaxOnEquip = state.MaxOnEquip
		if state.Level > 0 { // keep the default for pre-level saves
			s.Level = state.Level
		}
		s.Consumables = state.Consumables
		s.EquipHistory = state.EquipHistory

		for i, slotData := range state.Slots {
			slot := s.Slots[i]

			slot.BaseSlotData = slotData
			if slotData.ItemRef != nil {
				slot.Item = slotData.ItemRef.GetValue()
			}
			applyEnhancementLevels(&slot, slotData.EnhanceLevel, slotData.CaphrasLevel)

			s.Slots[i] = slot
		}
	}

	s.emitLoadoutUpdated()
}
