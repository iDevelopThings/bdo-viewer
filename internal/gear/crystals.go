package gear

import (
	"slices"

	"bdo-viewer/internal/catalog"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/stats"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

// Groups reserved to special preset slots (cannot go in free/base slots).
const (
	crystalGroupAncientSpirit = 101
	crystalGroupDawn          = 103
)

// CrystalSocket is one transfusion-preset socket (persisted by id + item ref).
type CrystalSocket struct {
	Id      model.CrystalPresetSlot       `json:"id"`
	ItemRef *models.EntityRef[model.Item] `json:"itemRef,omitempty"`
	Item    *model.Item                   `json:"-"`
}

// SimpleCrystalSlot is the loadout wire shape for one preset socket.
type SimpleCrystalSlot struct {
	Id       model.CrystalPresetSlot       `json:"id"`
	Unlocked bool                          `json:"unlocked"`
	Item     *sources.ListSourceEntry      `json:"item,omitempty"`
	ItemRef  *models.EntityRef[model.Item] `json:"itemRef,omitempty"`
}

// CrystalGroupUsage is one transfusion family's current / max count in the preset.
type CrystalGroupUsage struct {
	Key  uint32 `json:"key"`
	Name string `json:"name"`
	Max  int    `json:"max"`
	Used int    `json:"used"`
}

func emptyCrystalPreset() [model.CrystalPresetSlotMAX]CrystalSocket {
	var slots [model.CrystalPresetSlotMAX]CrystalSocket
	for id := range model.CrystalPresetSlots.All() {
		slots[id] = CrystalSocket{Id: id}
	}
	return slots
}

func (s *BuilderService) crystalUnlocked(id model.CrystalPresetSlot) bool {
	if id.Kind() != "dawn" {
		return true
	}
	item := s.Slots[id.DawnEquipSlot().Wire()].Item
	return item != nil && item.UnlocksDawnCrystalSlot
}

// SetCrystal places a jewel in a preset socket. Returns false on validation failure.
func (s *BuilderService) SetCrystal(slotId model.CrystalPresetSlot, itemRef *models.EntityRef[model.Item]) bool {
	if !slotId.Valid() || itemRef == nil {
		return false
	}
	item := itemRef.GetValue()
	if item == nil || item.ItemType != model.ItemTypes.Jewel || item.CrystalGroup == nil {
		return false
	}
	ok := false
	s.updateAndEmit(func() {
		if !s.crystalUnlocked(slotId) {
			return
		}
		if !s.canPlaceCrystal(slotId, item) {
			return
		}
		slot := &s.Crystals[slotId]
		slot.ItemRef = itemRef
		slot.Item = item
		ok = true
	})
	return ok
}

// ClearCrystal empties one preset socket.
func (s *BuilderService) ClearCrystal(slotId model.CrystalPresetSlot) {
	if !slotId.Valid() {
		return
	}
	s.updateAndEmit(func() {
		s.Crystals[slotId].ItemRef = nil
		s.Crystals[slotId].Item = nil
	})
}

func (s *BuilderService) canPlaceCrystal(slotId model.CrystalPresetSlot, item *model.Item) bool {
	groupKey := item.CrystalGroup.Key
	if sp := slotId.SpecialSlot(); sp.Valid() {
		if catalog.CrystalRules == nil {
			return false
		}
		allowed := catalog.CrystalRules.AllowedGroupsForSpecialSlot(sp)
		if !slices.Contains(allowed, groupKey) {
			return false
		}
	} else if groupKey == crystalGroupAncientSpirit || groupKey == crystalGroupDawn {
		return false
	}

	usage := map[uint32]int{}
	for id, slot := range s.Crystals {
		if model.CrystalPresetSlot(id) == slotId {
			continue
		}
		if slot.Item != nil && slot.Item.CrystalGroup != nil {
			usage[slot.Item.CrystalGroup.Key]++
		}
	}

	return !catalog.CrystalRules.GroupFull(item.CrystalGroup, usage)
}

// syncDawnCrystals clears Dawn sockets whose gear unlock was lost. Caller holds mu.
func (s *BuilderService) syncDawnCrystals() {
	for id := range model.CrystalPresetSlots.All() {
		if id.Kind() != "dawn" || s.crystalUnlocked(id) {
			continue
		}
		s.Crystals[id].ItemRef = nil
		s.Crystals[id].Item = nil
	}
}

func (s *BuilderService) activeCrystals() []*model.Item {
	items := make([]*model.Item, 0, model.CrystalPresetSlots.Len())
	for _, slot := range s.Crystals {
		if slot.Item != nil {
			items = append(items, slot.Item)
		}
	}
	return items
}

func (s *BuilderService) simpleCrystalSlots() []SimpleCrystalSlot {
	out := make([]SimpleCrystalSlot, 0, model.CrystalPresetSlots.Len())
	for id := range model.CrystalPresetSlots.All() {
		slot := s.Crystals[id]
		simple := SimpleCrystalSlot{
			Id:       id,
			Unlocked: s.crystalUnlocked(id),
			ItemRef:  slot.ItemRef,
		}
		if slot.Item != nil {
			extra := map[string]any{
				"grade": slot.Item.Grade,
			}
			if slot.Item.CrystalGroup != nil {
				extra["crystalGroup"] = slot.Item.CrystalGroup.Key
			}
			if summary := stats.NewStatBuilder().CrystalEffectSummary(slot.Item); summary != "" {
				extra["effects"] = summary
			}
			simple.Item = &sources.ListSourceEntry{
				URN:   slot.Item.GetURN().String(),
				Title: slot.Item.Name,
				Icon:  slot.Item.Icon,
				Extra: extra,
			}
		}
		out = append(out, simple)
	}
	return out
}

func (s *BuilderService) crystalGroupUsage() []CrystalGroupUsage {
	type agg struct {
		name string
		max  int
		used int
	}
	byKey := map[uint32]*agg{}
	for _, slot := range s.Crystals {
		if slot.Item == nil || slot.Item.CrystalGroup == nil {
			continue
		}
		g := slot.Item.CrystalGroup
		a := byKey[g.Key]
		if a == nil {
			a = &agg{name: g.Name, max: catalog.CrystalRules.EffectiveGroupMax(g)}
			byKey[g.Key] = a
		}
		a.used++
	}
	out := make([]CrystalGroupUsage, 0, len(byKey))
	for key, a := range byKey {
		out = append(out, CrystalGroupUsage{
			Key:  key,
			Name: a.name,
			Max:  a.max,
			Used: a.used,
		})
	}
	slices.SortFunc(out, func(a, b CrystalGroupUsage) int {
		if a.Name != b.Name {
			if a.Name < b.Name {
				return -1
			}
			return 1
		}
		return int(a.Key) - int(b.Key)
	})
	return out
}

func (s *BuilderService) hydrateCrystalItems() {
	for id := range model.CrystalPresetSlots.All() {
		s.Crystals[id].Id = id
		if s.Crystals[id].ItemRef != nil {
			s.Crystals[id].Item = s.Crystals[id].ItemRef.GetValue()
		} else {
			s.Crystals[id].Item = nil
		}
	}
	s.syncDawnCrystals()
}
