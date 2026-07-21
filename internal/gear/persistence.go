package gear

import (
	"encoding/json"
	"fmt"

	"github.com/tidwall/gjson"

	"bdo-viewer/internal/config"
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

const (
	// PersistedStateVersion is the version of the persisted state. We bump this when we change the
	// structure of the persisted state, and add the matching entry to stateMigrations.
	PersistedStateVersion = 3
)

type PersistedState struct {
	BuildName string `json:"buildName"`
	Version   int    `json:"version"`

	GearMastery MasteryConfigSet                          `json:"gearMastery"`
	Level       int                                       `json:"level"`
	Consumables models.EntityRefList[model.Item]          `json:"consumables"`
	Crystals    [model.CrystalPresetSlotMAX]CrystalSocket `json:"crystals"`
	Class       model.CharacterClassType                  `json:"class"`
	Slots       [model.SlotNameMAX]BaseSlotData           `json:"slots"`

	MaxOnEquip   bool                `json:"maxOnEquip"`   // If true, we automatically set the max enhancement level when equipping an item
	EquipHistory []EquipHistoryEntry `json:"equipHistory"` // The history of equipped items
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

	if s.loadFailed {
		s.mu.Unlock()
		s.app.Logger.Warn("Not saving gear builder state: the existing save couldn't be loaded")
		return
	}

	state := PersistedState{
		BuildName:    "My Build",
		Version:      PersistedStateVersion,
		GearMastery:  s.GearMastery,
		Level:        s.Level,
		Consumables:  s.Consumables,
		Crystals:     s.Crystals,
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
	state, migrated, err := s.readState()
	if err != nil {
		s.app.Logger.Error(fmt.Sprintf("Failed to load gear builder state: %v", err))
		s.mu.Lock()
		s.loadFailed = true
		s.mu.Unlock()
		return
	}
	// Potentially we don't have any state saved yet, so we just return and let the user start fresh
	if state == nil {
		return
	}

	s.db.Suppress(true)
	defer s.db.Suppress(false)

	s.mu.Lock()

	s.GearMastery = state.GearMastery
	s.Class = state.Class
	s.MaxOnEquip = state.MaxOnEquip
	if state.Level > 0 { // keep the default for pre-level saves
		s.Level = state.Level
	}
	s.Consumables = state.Consumables
	s.Crystals = state.Crystals
	s.hydrateCrystalItems()
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

	// Emitted inside the lock so it can't race Equip/Upgrade, same as updateAndEmit.
	s.emitLoadoutUpdated()
	s.mu.Unlock()

	// Write the upgraded shape back straight away so the next load has nothing to migrate,
	// rather than leaving it to whenever the user next changes something.
	if migrated {
		s.SaveState()
	}
}

// readState loads the persisted state, migrating the document up to PersistedStateVersion first.
// Returns a nil state when nothing has been saved yet.
func (s *BuilderService) readState() (*PersistedState, bool, error) {
	data, err := config.ReadRawJsonConfig("gear-builder-state.json")
	if err != nil || data == nil {
		return nil, false, err
	}

	// gjson treats malformed JSON as absent rather than erroring, which would let a migration
	// "succeed" by rewriting a corrupt file — so reject it up front.
	if !gjson.ValidBytes(data) {
		return nil, false, fmt.Errorf("state is not valid JSON")
	}

	upgraded, migrated, err := migrateState(data)
	if err != nil {
		return nil, false, err
	}
	if migrated {
		s.app.Logger.Info("Migrated gear builder state", "version", PersistedStateVersion)
	}

	var state PersistedState
	if err := json.Unmarshal(upgraded, &state); err != nil {
		return nil, false, fmt.Errorf("parse state: %w", err)
	}

	return &state, migrated, nil
}
