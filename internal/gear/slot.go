package gear

import (
	"bdo-viewer/internal/sources"
	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

// BaseSlotData we keep this separate state so we can write this straight to disk
type BaseSlotData struct {
	Id      model.SlotName                `json:"id"`
	ItemRef *models.EntityRef[model.Item] `json:"itemRef"`

	// True when we've equipped an item which "blocks" other slots, for ex, life skill gear, "manos fisher's clothes"
	Locked       bool            `json:"locked"`
	LockedBy     *model.SlotName `json:"lockedBy,omitempty"` // The slot which is locking this slot, if any
	EnhanceLevel int             `json:"enhanceLevel"`       // The enhancement level of the item
	CaphrasLevel int             `json:"caphrasLevel"`       // The caphras level of the item
}

type Slot struct {
	BaseSlotData

	Info model.SlotNameInfo `json:"info"` // Mainly for frontend
	Item *model.Item        `json:"item"`

	Enhancement *model.EnchantLevel `json:"enhancement"` // The enhancement info of the item
	Caphras     *model.CaphrasLevel `json:"caphras"`     // The caphras info of the item
}

type SlotResetKind int

const (
	// SlotResetKindFull - We want to reset the whole slot data
	SlotResetKindFull SlotResetKind = iota
	// SlotResetKindForLock - We want to reset the slot data for locking purposes
	SlotResetKindForLock
)

func (s *Slot) Reset(kind SlotResetKind) {
	if kind == SlotResetKindFull || kind == SlotResetKindForLock {
		s.LockedBy = nil
		s.Locked = false
	}
	if kind == SlotResetKindFull {
		s.Item = nil
		s.ItemRef = nil

		s.EnhanceLevel = 0
		s.Enhancement = nil

		s.CaphrasLevel = 0
		s.Caphras = nil
	}
}

// SimpleSlotData a lightweight version we can stream down to frontend
type SimpleSlotData struct {
	BaseSlotData
	Info                model.SlotNameInfo       `json:"info"`
	Item                *sources.ListSourceEntry `json:"item,omitempty"`
	EnhancementTitle    string                   `json:"enhancementTitle,omitempty"`
	EnhancementMinLevel int                      `json:"enhancementMinLevel,omitempty"`
	EnhancementMaxLevel int                      `json:"enhancementMaxLevel,omitempty"`
	CaphrasMinLevel     int                      `json:"caphrasMinLevel,omitempty"`
	CaphrasMaxLevel     int                      `json:"caphrasMaxLevel,omitempty"`
}
