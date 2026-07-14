// Generates frontend/src/state/gear/gear-slots.gen.ts from items.json: the
// distinct equip slot values and character class names in the data, plus the
// full gear-builder slot table (GEAR_SLOTS). Presentation facts the data can't
// express - grouping, instance counts (Ring x2), how a slot's AP contributes -
// live in the curated config below; slot values missing from it are still
// emitted with inferred defaults, so a data update can't silently drop a slot.
//
// Run via: task gen:gear-slots
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/util"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
)

const outPath = "frontend/src/state/gear/gear-slots.gen.ts"

type slotCfg struct {
	// EquipInfo.Slot values this UI slot accepts. Usually one; the in-game
	// tool accessory takes both "Fishing Chair" tools and "Lantern" items.
	values []string
	group  string   // combat | accessories | extra | life | costume
	apMode string   // "ap" | "aap" | "" (= both)
	ids    []string // instance ids; len > 1 duplicates the slot (Ring I/II)
	label  string   // display label override when the slot value is misleading
	skip   bool     // present in data but not character gear (ship/wagon parts)
}

func s(values ...string) []string { return values }

// Emitted in this order; ids are load-bearing - they key persisted builds in
// localStorage, so renaming one orphans users' saved gear for that slot.
var slotConfigs = []slotCfg{
	{values: s("Main Weapon"), group: "combat", apMode: "ap", ids: []string{"mainWeapon"}},
	{values: s("Sub-weapon"), group: "combat", ids: []string{"subWeapon"}},
	{values: s("Awakening Weapon"), group: "combat", apMode: "aap", ids: []string{"awakeningWeapon"}},
	{values: s("Helmet"), group: "combat", ids: []string{"helmet"}},
	{values: s("Armor"), group: "combat", ids: []string{"armor"}},
	{values: s("Gloves"), group: "combat", ids: []string{"gloves"}},
	{values: s("Shoes"), group: "combat", ids: []string{"shoes"}},

	{values: s("Necklace"), group: "accessories", ids: []string{"necklace"}},
	{values: s("Earring"), group: "accessories", ids: []string{"earring1", "earring2"}},
	{values: s("Ring"), group: "accessories", ids: []string{"ring1", "ring2"}},
	{values: s("Belt"), group: "accessories", ids: []string{"belt"}},

	{values: s("Alchemy Stone"), group: "extra", ids: []string{"alchemyStone"}},
	{values: s("Artifact"), group: "extra", ids: []string{"artifact1", "artifact2"}},
	{values: s("Tome"), group: "extra", ids: []string{"tome"}},
	{values: s("Underwear"), group: "extra", ids: []string{"underwear"}},

	{values: s("Butcher Knife"), group: "life", ids: []string{"butcherKnife"}},
	{values: s("Fishing Rod"), group: "life", ids: []string{"fishingRod"}},
	{values: s("Pickaxe"), group: "life", ids: []string{"pickaxe"}},
	{values: s("Hoe"), group: "life", ids: []string{"hoe"}},
	{values: s("Lumbering Axe"), group: "life", ids: []string{"lumberingAxe"}},
	{values: s("Tanning Knife"), group: "life", ids: []string{"tanningKnife"}},
	{values: s("Fishing Float"), group: "life", ids: []string{"fishingFloat"}},
	{values: s("Fishing Harpoon"), group: "life", ids: []string{"fishingHarpoon"}},
	{values: s("Fluid Collector"), group: "life", ids: []string{"fluidCollector"}},

	// The extractor names these after one item type, but they're the in-game
	// accessory slots: "Fishing Chair" also holds riding crops, flasks, hunting
	// bags, ladles, processing stones and sailing logs, and the same in-game
	// slot takes lanterns (Accessory: Tool); "Gathering Carrier" holds
	// otter/papu carriers and boards (Accessory: Back).
	{values: s("Fishing Chair", "Lantern"), group: "extra", ids: []string{"fishingChair"}, label: "Tool Accessory"},
	{values: s("Gathering Carrier"), group: "extra", ids: []string{"gatheringCarrier"}, label: "Back Accessory"},

	// Sails, wagon covers, boat decorations - vehicle equipment, not character gear.
	{values: s("Ship Gear"), skip: true},

	{values: s("Costume: Helmet"), group: "costume", ids: []string{"costumeHelmet"}},
	{values: s("Costume: Armor"), group: "costume", ids: []string{"costumeArmor"}},
	{values: s("Costume: Gloves"), group: "costume", ids: []string{"costumeGloves"}},
	{values: s("Costume: Shoes"), group: "costume", ids: []string{"costumeShoes"}},
	{values: s("Costume: Main Weapon"), group: "costume", ids: []string{"costumeMainWeapon"}},
	{values: s("Costume: Sub-weapon"), group: "costume", ids: []string{"costumeSubWeapon"}},
	{values: s("Costume: Awakening Weapon"), group: "costume", ids: []string{"costumeAwakening"}},
	{values: s("Costume: Earring"), group: "costume", ids: []string{"costumeEarring"}},
	{values: s("Costume: Headpiece"), group: "costume", ids: []string{"costumeHeadpiece"}},
	{values: s("Costume: Piercing"), group: "costume", ids: []string{"costumePiercing"}},
}

func main() {
	dataDir := config.GetExtractedDataDir()

	var items []model.Item
	if err := util.ReadJSON(filepath.Join(dataDir, "items.json"), &items); err != nil {
		log.Fatalf("read items.json: %v", err)
	}

	slots := map[string]bool{}
	kinds := map[string]bool{}
	types := map[string]bool{}
	classes := map[string]bool{}
	itemTypes := map[string]bool{}

	for i := range items {
		it := &items[i]
		if it.EquipInfo != nil {
			if it.EquipInfo.Slot != "" {
				slots[it.EquipInfo.Slot] = true
			}
			for _, s := range it.EquipInfo.Slots {
				if s != "" {
					slots[s] = true
				}
			}

			if it.EquipInfo.Kind != "" {
				kinds[it.EquipInfo.Kind] = true
			}

			if it.EquipInfo.Type != "" {
				types[it.EquipInfo.Type] = true
			}
		}

		if it.ItemType != "" {
			itemTypes[it.ItemType] = true
		}
		for _, c := range it.Classes {
			if c != "" {
				classes[c] = true
			}
		}

	}

	configured := map[string]bool{}
	cfgs := make([]slotCfg, 0, len(slotConfigs))
	for _, cfg := range slotConfigs {
		present := cfg.values[:0:0]
		for _, v := range cfg.values {
			configured[v] = true
			if slots[v] {
				present = append(present, v)
			} else {
				log.Printf("warning: configured slot %q no longer exists in items.json", v)
			}
		}
		if cfg.skip || len(present) == 0 {
			continue
		}
		cfg.values = present
		cfgs = append(cfgs, cfg)
	}

	// Data slots the config doesn't know yet get inferred defaults instead of
	// being dropped.
	for _, value := range keysSorted(slots) {
		if configured[value] {
			continue
		}
		log.Printf("note: slot %q not in curated config, emitting with inferred defaults", value)
		cfgs = append(
			cfgs, slotCfg{
				values: s(value),
				group:  inferGroup(value),
				ids:    []string{camelCase(value)},
			},
		)
	}

	var b strings.Builder
	b.WriteString("// Code generated by `task gen:gear-slots` (cmd/gen-gear-slots). DO NOT EDIT.\n")
	b.WriteString("// Slot values and class names come from items.json; grouping, instance\n")
	b.WriteString("// counts and AP modes come from the generator's curated config.\n\n")

	writeList(&b, "EQUIP_SLOTS", keysSorted(slots))
	b.WriteString("export type EquipSlot = typeof EQUIP_SLOTS[number];\n\n")

	writeList(&b, "CHARACTER_CLASSES", keysSorted(classes))
	b.WriteString("export type CharacterClass = typeof CHARACTER_CLASSES[number];\n\n")

	b.WriteString("export type GearGroupId = \"combat\" | \"accessories\" | \"extra\" | \"life\" | \"costume\";\n\n")
	b.WriteString("// How a slot's AP contributes to build totals: the main weapon only counts\n")
	b.WriteString("// toward AP, the awakening weapon only toward AAP, everything else toward both.\n")
	b.WriteString("export type ApMode = \"ap\" | \"aap\" | \"both\";\n\n")
	b.WriteString("export type GearSlotDef = {\n")
	b.WriteString("\t// Unique slot instance id (two rings share one equip slot); keys persisted\n")
	b.WriteString("\t// builds in localStorage.\n")
	b.WriteString("\tid: string;\n")
	b.WriteString("\tlabel: string;\n")
	b.WriteString("\t// Data slot values this UI slot accepts (tool accessory takes lanterns too).\n")
	b.WriteString("\tequipSlots: EquipSlot[];\n")
	b.WriteString("\tgroup: GearGroupId;\n")
	b.WriteString("\tapMode: ApMode;\n")
	b.WriteString("};\n\n")

	b.WriteString("export const GEAR_SLOTS: GearSlotDef[] = [\n")
	for _, cfg := range cfgs {
		apMode := cfg.apMode
		if apMode == "" {
			apMode = "both"
		}
		values := make([]string, len(cfg.values))
		for i, v := range cfg.values {
			values[i] = fmt.Sprintf("%q", v)
		}
		for i, id := range cfg.ids {
			fmt.Fprintf(
				&b, "\t{id: %q, label: %q, equipSlots: [%s], group: %q, apMode: %q},\n",
				id, label(cfg, i), strings.Join(values, ", "), cfg.group, apMode,
			)
		}
	}
	b.WriteString("];\n")

	b.WriteString("export const ITEM_TYPES = [\n")
	for _, t := range keysSorted(itemTypes) {
		fmt.Fprintf(&b, "\t%q,\n", t)
	}
	b.WriteString("] as const;\n")
	b.WriteString("export type ItemType = typeof ITEM_TYPES[number];\n")

	b.WriteString("export const EQUIP_KINDS = [\n")
	for _, k := range keysSorted(kinds) {
		fmt.Fprintf(&b, "\t%q,\n", k)
	}
	b.WriteString("] as const;\n")
	b.WriteString("export type EquipKind = typeof EQUIP_KINDS[number];\n")

	b.WriteString("export const EQUIP_TYPES = [\n")
	for _, t := range keysSorted(types) {
		fmt.Fprintf(&b, "\t%q,\n", t)
	}
	b.WriteString("] as const;\n")
	b.WriteString("export type EquipType = typeof EQUIP_TYPES[number];\n")

	if err := os.WriteFile(outPath, []byte(b.String()), 0o644); err != nil {
		log.Fatalf("write %s: %v", outPath, err)
	}

	fmt.Printf("wrote %s (%d slot values, %d classes)\n", outPath, len(slots), len(classes))
}

var romans = []string{"I", "II", "III", "IV"}

func label(cfg slotCfg, instance int) string {
	base := cfg.label
	if base == "" {
		base = strings.ReplaceAll(cfg.values[0], ": ", " ")
	}
	if len(cfg.ids) > 1 {
		return base + " " + romans[instance]
	}
	return base
}

func inferGroup(value string) string {
	if strings.HasPrefix(value, "Costume:") {
		return "costume"
	}
	return "extra"
}

var nonAlnum = regexp.MustCompile(`[^a-zA-Z0-9]+`)

func camelCase(value string) string {
	words := nonAlnum.Split(value, -1)
	var out strings.Builder
	for i, w := range words {
		if w == "" {
			continue
		}
		if i == 0 {
			out.WriteString(strings.ToLower(w[:1]) + w[1:])
		} else {
			out.WriteString(strings.ToUpper(w[:1]) + w[1:])
		}
	}
	return out.String()
}

func writeList(b *strings.Builder, name string, values []string) {
	fmt.Fprintf(b, "export const %s = [\n", name)
	for _, v := range values {
		fmt.Fprintf(b, "\t%q,\n", v)
	}
	b.WriteString("] as const;\n")
}

func keysSorted(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
