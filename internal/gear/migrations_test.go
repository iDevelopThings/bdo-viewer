package gear

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/tidwall/gjson"
)

// TestMigrateEquipHistorySlots covers the v1 -> v2 shape change: bare item refs become entries
// carrying the slot the item belongs to, resolved from the item itself.
func TestMigrateEquipHistorySlots(t *testing.T) {
	bootStores(t)

	doc := []byte(`{
		"version": 1,
		"buildName": "My Build",
		"equipHistory": ["urn::item:12141", "urn::item:0"]
	}`)

	upgraded, migrated, err := migrateState(doc)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if !migrated {
		t.Fatal("expected the v1 document to be migrated")
	}

	if version := gjson.GetBytes(upgraded, "version").Int(); version != PersistedStateVersion {
		t.Fatalf("version = %d; want %d", version, PersistedStateVersion)
	}

	// Untouched keys must survive the migration.
	if name := gjson.GetBytes(upgraded, "buildName").String(); name != "My Build" {
		t.Errorf("buildName = %q; want it left alone", name)
	}

	var entries []EquipHistoryEntry
	if err := json.Unmarshal([]byte(gjson.GetBytes(upgraded, "equipHistory").Raw), &entries); err != nil {
		t.Fatalf("decode migrated history: %v", err)
	}
	// The unresolvable ref is dropped, so only the real item survives.
	if len(entries) != 1 {
		t.Fatalf("got %d entries; want 1", len(entries))
	}

	item := entries[0].Item.GetValue()
	if item == nil || item.EquipInfo == nil {
		t.Fatal("migrated entry lost its item")
	}
	if entries[0].Slot != item.EquipInfo.Slot {
		t.Errorf("slot = %v; want %v", entries[0].Slot, item.EquipInfo.Slot)
	}
}

// TestMigrateStateNoopAtCurrentVersion guards against a current-version save being rewritten.
func TestMigrateStateNoopAtCurrentVersion(t *testing.T) {
	doc := []byte(fmt.Sprintf(
		`{"version":%d,"equipHistory":[{"item":"urn::item:12141","slot":12}]}`,
		PersistedStateVersion,
	))

	upgraded, migrated, err := migrateState(doc)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if migrated {
		t.Error("a current-version document should not be migrated")
	}
	if string(upgraded) != string(doc) {
		t.Errorf("document = %s; want it untouched", upgraded)
	}
}

// TestMigrateStateRejectsNewerVersion keeps a downgrade from silently clobbering a newer save.
func TestMigrateStateRejectsNewerVersion(t *testing.T) {
	doc := []byte(fmt.Sprintf(`{"version":%d}`, PersistedStateVersion+1))

	if _, _, err := migrateState(doc); err == nil {
		t.Error("expected an error for a state written by a newer build")
	}
}
