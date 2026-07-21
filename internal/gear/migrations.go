package gear

import (
	"fmt"
	"log"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// stateMigrations upgrade a persisted state document one version forward, keyed by the version
// they migrate FROM: stateMigrations[1] turns a v1 document into a v2 one. Add an entry here
// whenever PersistedStateVersion is bumped.
//
// They work on the raw JSON rather than PersistedState so each one only rewrites the paths it
// cares about — everything else survives byte for byte, including fields this build has since
// renamed or dropped.
var stateMigrations = map[int]func(doc []byte) ([]byte, error){
	1: migrateEquipHistorySlots,
	2: migrateCrystalPreset,
}

func migrateCrystalPreset(doc []byte) ([]byte, error) {
	if gjson.GetBytes(doc, "crystals").Exists() {
		return doc, nil
	}
	slots := emptyCrystalPreset()
	return sjson.SetBytes(doc, "crystals", slots)
}

// migrateState walks doc up to PersistedStateVersion, returning the upgraded document and whether
// anything changed. Migrations run when the builder panel is opened, so the catalog is loaded and
// item refs resolve. Callers must validate the JSON first — gjson reads malformed input as absent.
func migrateState(doc []byte) ([]byte, bool, error) {
	version := int(gjson.GetBytes(doc, "version").Int())

	if version > PersistedStateVersion {
		return nil, false, fmt.Errorf("state version %d was written by a newer build than this one (%d)", version, PersistedStateVersion)
	}

	migrated := false
	for version < PersistedStateVersion {
		migrate, ok := stateMigrations[version]
		if !ok {
			return nil, false, fmt.Errorf("no migration from state version %d", version)
		}

		next, err := migrate(doc)
		if err != nil {
			return nil, false, fmt.Errorf("migrate state v%d -> v%d: %w", version, version+1, err)
		}

		doc = next
		version++
		migrated = true
	}

	if migrated {
		next, err := sjson.SetBytes(doc, "version", version)
		if err != nil {
			return nil, false, err
		}
		doc = next
	}

	return doc, migrated, nil
}

// v1 stored equipHistory as bare item refs. Which slot an item came out of isn't recorded anywhere
// in a v1 save, so fall back to the item's own equip slot — the same field the picker filters on,
// and correct for everything but which half of a pair (Ring I vs Ring II) it held.
func migrateEquipHistorySlots(doc []byte) ([]byte, error) {
	history := gjson.GetBytes(doc, "equipHistory")
	if !history.Exists() {
		return doc, nil
	}

	refs := history.Array()
	entries := make([]EquipHistoryEntry, 0, len(refs))
	for _, raw := range refs {
		u, err := urn.Parse(raw.String())
		if err != nil {
			continue
		}

		ref := models.NewEntityRef[model.Item](u)
		item := ref.GetValue()
		if item == nil || item.EquipInfo == nil {
			continue
		}

		entries = append(entries, EquipHistoryEntry{
			Item: *ref,
			Slot: item.EquipInfo.Slot,
		})
	}

	// The dropped ones are refs the catalog can't resolve any more, and this rewrite is saved back
	// immediately — so say how many went, otherwise the history just quietly gets shorter.
	if dropped := len(refs) - len(entries); dropped > 0 {
		log.Printf("gear state v1 -> v2: dropped %d unresolvable equip history entries", dropped)
	}

	return sjson.SetBytes(doc, "equipHistory", entries)
}
