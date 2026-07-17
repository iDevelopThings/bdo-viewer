package gear

import (
	"context"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"bdo-viewer/internal/util"
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

const (
	EventLoadoutUpdated = "gear-builder:loadout-updated"
)

type EventLoadoutUpdatedPayload struct {
	GearMastery MasteryConfigSet             `json:"gearMastery"`
	Level       int                          `json:"level"`
	Class       model.CharacterClassTypeInfo `json:"class,omitempty"`
	Slots       [model.SlotNameMAX]Slot      `json:"slots"`
	MaxOnEquip  bool                         `json:"maxOnEquip"`
	Stats       *StatSheet                   `json:"stats"`
}

// defaultLevel is the character level the stat pipeline assumes until the UI
// exposes a control for it (level is a constant offset for gear comparison).
const defaultLevel = 65

func init() {
	application.RegisterEvent[EventLoadoutUpdatedPayload](EventLoadoutUpdated)
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

	Class model.CharacterClassType `json:"class"`
	Slots [model.SlotNameMAX]Slot  `json:"slots"`

	// Level and Fitness feed the stat pipeline. Not yet UI-exposed; Level
	// defaults to defaultLevel, Fitness to zero.
	Level   int     `json:"level"`
	Fitness Fitness `json:"fitness"`

	// If true, we automatically set the max enhancement level when equipping an item
	MaxOnEquip bool `json:"maxOnEquip"`
}

var Service *BuilderService

func NewBuilderService() *BuilderService {
	Service = &BuilderService{
		db: util.NewDebouncer(500*time.Millisecond, func() {
			Service.SaveState()
		}),

		GearMastery: MasteryConfigSet{},

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
		Service.Slots[info.Wire()].Reset()
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

func (s *BuilderService) Equip(slotId model.SlotName, itemRef *models.EntityRef[model.Item]) bool {
	if !slotId.Valid() {
		return false
	}

	s.mu.Lock()
	if s.Slots[slotId].Locked {
		s.mu.Unlock()
		return false
	}
	item := itemRef.GetValue()
	if item == nil {
		s.mu.Unlock()
		return false
	}

	if item.EquipInfo == nil /*|| !slotId.Supports(item.EquipInfo.GetSlotId())*/ {
		s.mu.Unlock()
		return false
	}

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

	s.emitLoadoutUpdated()

	s.mu.Unlock()
	s.db.Trigger()

	return true
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

	s.Slots[slotId].Reset()

	s.emitLoadoutUpdated()

	s.mu.Unlock()
	s.db.Trigger()

	// TODO: If this item blocks other slots, unblock them

	return true
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

func (s *BuilderService) ToggleMaxOnEquip() {
	s.updateAndEmit(func() {
		s.MaxOnEquip = !s.MaxOnEquip
	})
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
	return ComputeStats(s.Class, s.Level, s.Fitness, s.playerMastery(), s.Slots[:])
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

func (s *BuilderService) emitLoadoutUpdated() {
	s.app.Event.Emit(EventLoadoutUpdated, EventLoadoutUpdatedPayload{
		GearMastery: s.GearMastery,
		Level:       s.Level,
		Class:       s.Class.Info(),
		Slots:       s.Slots,
		MaxOnEquip:  s.MaxOnEquip,
		Stats:       s.computeStats(),
	})
}
