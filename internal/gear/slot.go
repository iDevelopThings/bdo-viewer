package gear

import (
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

// BaseSlotData we keep this separate state so we can write this straight to disk
type BaseSlotData struct {
	Id      model.SlotName                `json:"id"`
	ItemRef *models.EntityRef[model.Item] `json:"itemRef"`

	// True when we've equipped an item which "blocks" other slots, for ex, life skill gear, "manos fisher's clothes"
	Locked       bool `json:"locked"`
	EnhanceLevel int  `json:"enhanceLevel"` // The enhancement level of the item
	CaphrasLevel int  `json:"caphrasLevel"` // The caphras level of the item
}

type Slot struct {
	BaseSlotData

	Info model.SlotNameInfo `json:"info"` // Mainly for frontend
	Item *model.Item        `json:"item"`

	Enhancement *model.EnchantLevel `json:"enhancement"` // The enhancement info of the item
	Caphras     *model.CaphrasLevel `json:"caphras"`     // The caphras info of the item
}

func (s *Slot) Reset() {
	s.Item = nil
	s.ItemRef = nil

	s.Locked = false

	s.EnhanceLevel = 0
	s.Enhancement = nil

	s.CaphrasLevel = 0
	s.Caphras = nil
}
