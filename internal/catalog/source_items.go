package catalog

import (
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/idevelopthings/bdo-data-extractor/src/utils"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/recipe"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/stats"
	"bdo-viewer/internal/util"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// CategoryCount Holds market category counts and subcategory counts for the item source.
// Used by the frontend to display counts in the navigation tree.
type CategoryCount struct {
	Total         int
	BySubCategory map[string]int
}

type ItemSource struct {
	*sources.BaseSource

	navigation *sources.SourceNavigationNodeSimple

	// All heavy fields are json:"-": sources are returned to the frontend via
	// GetAllSources, which only needs the BaseSource kind/urn — serializing the
	// stores/indexes would ship the entire dataset to the webview (OOM).
	Store            *models.Store[model.Item]        `json:"-"`
	EnhancementStore *models.Store[model.Enhancement] `json:"-"`
	ItemSetStore     *models.Store[model.ItemSet]     `json:"-"`

	// canonical item URN -> its reissued copies (variantOf links from items.json)
	ItemVariants map[urn.URN][]*model.Item `json:"-"`

	// NPC ID -> items sold by that NPC (vendor)
	ItemVendors map[uint32][]*model.Item `json:"-"`

	EquipType []string `json:"-"`

	// MarketCategories is the central-market taxonomy (marketcategories.json),
	// the navigation tree's structure; per-category item counts come from
	// CategoryCounts.
	MarketCategories []MarketCategoryWithCount `json:"-"`

	// ByName: a View — pure function of the raw loaded items, computed
	// once on first Get(). Doesn't depend on Build() having run.
	ByName map[string]*model.Item `json:"-"`

	CategoryCounts *models.Reducer[model.Item, map[string]*CategoryCount] `json:"-"`

	UniqueCrystalStatIds []model.StatId `json:"-"`
}

var (
	_ sources.Source = (*ItemSource)(nil)

	Items *ItemSource
)

func NewItemSource() *ItemSource {
	Items = &ItemSource{
		BaseSource: &sources.BaseSource{
			Kind: sources.Item,
			URN:  sources.NewSourceURN(urn.Item, "", ""),
			Sorts: []sources.SortOption{
				{Key: "name", Label: "Name"},
				{Key: "grade", Label: "Grade"},
				{Key: "weight", Label: "Weight"},
			},
		},
	}

	return Items
}

func (s *ItemSource) GetSourceKind() sources.SourceKind { return s.Kind }

// Load builds the item Store from the loaded catalog and registers it. It runs
// via SourceRegistry.LoadAll (after catalog.New), not at package init — the
// constructor must not touch Instance, which is nil until startup.
func (s *ItemSource) Load() error {
	var items []model.Item

	const steps = 5
	step := 0

	{
		ijTimed := utils.Timed("[SOURCE] load items.json")
		defer ijTimed()

		step++
		s.Reporter.Step(step, steps, "Loading items.json")
		if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "items.json"), &items); err != nil {
			return errors.Wrap(err, "read items.json")
		}
	}

	step++
	s.Reporter.Step(step, steps, "Loading item_enhancements.json")
	if err := s.loadEnhancements(); err != nil {
		return err
	}

	step++
	s.Reporter.Step(step, steps, "Loading marketcategories.json")
	if err := s.loadMarketCategories(); err != nil {
		return err
	}

	s.ItemVendors = make(map[uint32][]*model.Item, 0)
	s.ItemVariants = make(map[urn.URN][]*model.Item)
	s.EquipType = make([]string, 0)
	s.ByName = make(map[string]*model.Item)
	s.UniqueCrystalStatIds = make([]model.StatId, 0)

	step++
	s.Reporter.Step(step, steps, "Loading item_sets.json")
	if err := s.loadItemSets(); err != nil {
		return err
	}

	s.Store = models.NewStore[model.Item](
		len(items), func(u urn.URN) bool {
			return u.Domain == urn.Item.Domain()
		},
	)

	step++
	s.Reporter.Step(step, steps, "Registering items")

	for i := range items {
		it := &items[i]

		if it.VariantOf != nil {
			s.ItemVariants[it.VariantOf.URN] = append(s.ItemVariants[it.VariantOf.URN], it)
		}

		if it.EquipInfo != nil && it.EquipInfo.Type != "" && !slices.Contains(s.EquipType, it.EquipInfo.Type) {
			s.EquipType = append(s.EquipType, it.EquipInfo.Type)
		}

		if err := s.Store.Add(it.GetURN(), it); err != nil {
			return fmt.Errorf("registering item %d: %w", it.ID, err)
		}

		s.Reporter.Progress(int64(i+1), int64(len(items)))
	}

	// Update image paths relative to viewer
	s.Store.AddHook(
		func(it *model.Item) error {
			it.Icon = "/icons/by-urn/" + it.GetURN().String()
			return nil
		},
	)
	// Link enhancements to items (item.Enhancement -> enhancement.URN) and vice versa (enhancement.Items -> item.URN).
	s.Store.AddHook(
		func(it *model.Item) error {
			if it.Enhancement == nil {
				return nil
			}

			if e, ok := s.EnhancementStore.Get(it.Enhancement.Urn); ok {
				it.Enhancement.Levels = e.Levels
			}

			return nil
		},
	)

	// Index stat ids used on transfusion jewels (crystals) for the frontend's crystal picker.
	s.Store.AddHook(
		func(it *model.Item) error {
			if it.CrystalGroup == nil {
				return nil
			}
			if it.Effects == nil {
				return nil
			}

			for _, stat := range it.Effects.Stats.Stats {
				s.indexCrystalStatId(stat.StatID)
			}

			return nil
		},
	)

	// Build the ItemVendors index (NPC ID -> items sold by that NPC) from each item's
	// vendor refs.
	s.Store.AddHook(
		func(it *model.Item) error {
			if it.Vendors == nil {
				return nil
			}
			for _, u := range it.Vendors.URNs {
				npc, ok := models.ResolveUrn[model.NPC](u)
				if !ok || npc == nil {
					continue
				}
				if !slices.ContainsFunc(s.ItemVendors[npc.ID], func(existing *model.Item) bool { return existing.ID == it.ID }) {
					s.ItemVendors[npc.ID] = append(s.ItemVendors[npc.ID], it)
				}
			}

			return nil
		},
	)
	s.Store.AddHook(
		func(it *model.Item) error {
			if it.Name == "" {
				return nil
			}

			if _, ok := s.ByName[it.Name]; ok {
				return nil
			}
			s.ByName[it.Name] = it
			return nil
		},
	)

	s.CategoryCounts = models.NewReducer(
		s.Store, map[string]*CategoryCount{}, func(acc map[string]*CategoryCount, it *model.Item) map[string]*CategoryCount {
			cc, ok := acc[it.MarketCategory]
			if !ok {
				cc = &CategoryCount{BySubCategory: make(map[string]int)}
				acc[it.MarketCategory] = cc
			}
			cc.Total++
			cc.BySubCategory[it.MarketSubCategory]++
			return acc
		},
	)

	models.RegisterStore(s.Store)

	return nil
}

func (s *ItemSource) loadItemSets() error {
	var sets []model.ItemSet
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "item_sets.json"), &sets); err != nil {
		return errors.Wrap(err, "read item_sets.json")
	}

	s.ItemSetStore = models.NewStore[model.ItemSet](
		len(sets),
		func(u urn.URN) bool { return u.Domain == urn.ItemSet.Domain() },
	)

	for i := range sets {
		set := &sets[i]
		if err := s.ItemSetStore.Add(set.GetURN(), set); err != nil {
			return fmt.Errorf("registering item set %s: %w", set.GetURN().String(), err)
		}
	}

	models.RegisterStore(s.ItemSetStore)

	return nil
}

func (s *ItemSource) loadEnhancements() error {
	ijTimed := utils.Timed("[SOURCE] load enhancements.json")
	defer ijTimed()

	var enhancements []model.Enhancement

	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "item_enhancements.json"), &enhancements); err != nil {
		return errors.Wrap(err, "read item_enhancements.json")
	}

	s.EnhancementStore = models.NewStore[model.Enhancement](
		len(enhancements),
		func(u urn.URN) bool {
			return u.Domain == urn.Enhancement.Domain()
		},
	)
	for i := range enhancements {
		en := &enhancements[i]
		if err := s.EnhancementStore.Add(en.GetURN(), en); err != nil {
			return fmt.Errorf("registering enhancement %s: %w", en.GetURN().String(), err)
		}
	}
	models.RegisterStore(s.EnhancementStore)

	return nil
}

// loadMarketCategories reads the central-market taxonomy (marketcategories.json).
func (s *ItemSource) loadMarketCategories() error {
	timed := utils.Timed("[SOURCE] load marketcategories.json")
	defer timed()

	var cats []model.MarketCategory
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "marketcategories.json"), &cats); err != nil {
		return errors.Wrap(err, "read marketcategories.json")
	}

	s.MarketCategories = make([]MarketCategoryWithCount, len(cats))
	for i := range cats {
		s.MarketCategories[i] = MarketCategoryWithCount{
			ID:            cats[i].ID,
			Name:          cats[i].Name,
			SubCategories: make([]MarketCategoryWithCount, len(cats[i].SubCategories)),
		}
		for j := range cats[i].SubCategories {
			s.MarketCategories[i].SubCategories[j] = MarketCategoryWithCount{
				ID:   cats[i].SubCategories[j].ID,
				Name: cats[i].SubCategories[j].Name,
			}
		}
	}

	return nil
}

func (s *ItemSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	if s.navigation != nil {
		return *s.navigation
	}

	// Per-category item counts come from the CategoryCounts reducer (computed in
	// Build); the taxonomy provides structure and order.
	counts, _ := s.CategoryCounts.Result()

	s.navigation = &sources.SourceNavigationNodeSimple{
		Id:       "item",
		Title:    "Items",
		Children: make([]sources.SourceNavigationNodeSimple, len(s.MarketCategories)),
	}

	for i, category := range s.MarketCategories {
		cc := counts[category.Name]
		children := make([]sources.SourceNavigationNodeSimple, len(category.SubCategories))
		for j, sub := range category.SubCategories {
			subCount := 0
			if cc != nil {
				subCount = cc.BySubCategory[sub.Name]
			}
			children[j] = sources.SourceNavigationNodeSimple{
				Id:    sub.Name,
				Title: sub.Name,
				Count: subCount,
			}
		}
		total := 0
		if cc != nil {
			total = cc.Total
		}
		s.navigation.Children[i] = sources.SourceNavigationNodeSimple{
			Id:       category.Name,
			Title:    category.Name,
			Count:    total,
			Children: children,
		}
	}

	return *s.navigation
}

func (s *ItemSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	item, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, item, ok)
}

func (s *ItemSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	item, ok := s.Store.Get(ref)
	if !ok {
		return false
	}
	data := *outDetails
	data[string(s.Kind)] = item
	// lazy, selection-aware crafting tree (default selection); the frontend
	// re-requests recipe.Resolver.ResolveRecipeTree directly when a recipe or
	// ingredient alternative is picked.
	data["recipes"] = recipe.Instance.ResolveRecipeTree(ref, nil, nil)
	data["usedIn"] = recipe.Instance.UsedIn(ref)
	data["stats"] = s.GetStats(ref, 0, 0)

	themes, entries := Knowledge.ItemKnowledge(ref)
	data["knowledge"] = map[string]any{
		"themes":  themes,
		"entries": entries,
	}

	data["vendors"] = Instance.GetItemVendorData(ref)

	if variants := s.ItemVariants[ref]; len(variants) > 0 {
		urns := make([]urn.URN, len(variants))
		for i, v := range variants {
			urns[i] = v.GetURN()
		}
		data["variants"] = urns
	}

	return true
}

func (s *ItemSource) GetStats(ref urn.URN, level int, caphrasStep int) []stats.StatGroup {
	item, ok := s.Store.Get(ref)
	if !ok {
		return nil
	}

	enchant := item.FindEnchantLevel(level)

	var bonus stats.CaphrasStatBonus
	var caphrasLevel *model.CaphrasLevel
	if enchant != nil {
		if caphrasLevel = enchant.GetCaphrasLevel(caphrasStep); caphrasLevel != nil {
			bonus = stats.ResolveCaphrasStatBonus(caphrasLevel)
		}
	}

	b := stats.NewStatBuilder()

	eff := b.Section(stats.StatGroupKindEffects)
	if enchant != nil {
		ap, apMin, apMax, isApRange := enchant.GetApRange(bonus.AP)
		if isApRange {
			eff.Range("AP", apMin, apMax, ap)
		} else {
			eff.Number("AP", ap)
		}

		eff.NumberNonZero("Accuracy", float64(enchant.Accuracy)+bonus.Accuracy)
		eff.NumberNonZero("DP", float64(enchant.Dp)+bonus.DP())
		eff.NumberNonZero("Evasion", float64(enchant.Evasion)+bonus.Evasion)
		eff.NumberNonZero("Damage Reduction", float64(enchant.DamageReduction)+bonus.DamageReduction)
		eff.NumberNonZero("Max HP", float64(enchant.MaxHP)+bonus.MaxHP)
	}

	eff.NumberNonZero("Max Durability", float64(item.GetDurability(enchant)))

	card := b.Section(stats.StatGroupKindCard)
	card.MoneyNonZero("Buy Price", item.BuyPrice)
	card.MoneyNonZero("Sell Price", item.SellPrice)
	card.NumberUnitNonZero("Weight", item.Weight, "LT")
	card.NumberNonZero("Max Stack", float64(item.MaxStack))

	card.DurationNonZero("Expires", float64(item.ExpirationMinutes), time.Minute)
	if item.Effects != nil {
		card.DurationNonZero("Duration", float64(item.Effects.DurationMs), time.Millisecond)
		card.DurationNonZero("Cooldown", float64(item.Effects.CooldownMs), time.Millisecond)
	}

	if enchant != nil {
		b.ExtendWithEffectGroups(enchant.Effects...)

		if caphrasLevel != nil {
			b.ExtendWithEffectGroups(caphrasLevel.Effects...)
		}
	}

	// Consumable buffs (alchemy stones, food/elixirs, life gear) carry their
	// stats as StatMod groups instead of/alongside the enhancement DSL.
	if item.Effects != nil {
		b.ExtendWithEffectGroup(item.Effects.Stats)
		b.ExtendWithEffectGroup(item.Effects.Hidden)
	}

	return b.Build()
}

/*func (s *ItemSource) GetEffects(ref urn.URN, level int, caphrasStep int) []stats.EffectSection {
	item, ok := s.Store.Get(ref)
	if !ok {
		return nil
	}

	var sections []stats.EffectSection
	if enchant := item.FindEnchantLevel(level); enchant != nil {
		sections = stats.DslEffectSections(enchant.Effects)
		sections = append(sections, stats.CaphrasEffectSections(enchant.Caphras, caphrasStep)...)
	}

	if item.Effects != nil {
		sections = append(sections, stats.BuffOpEffectSections(item.Effects.Stats, "Buff Effects")...)
		sections = append(sections, stats.BuffOpEffectSections(item.Effects.Hidden, "Hidden Effects")...)
	}

	return sections
}*/

type crystalFilters struct {
	// CrystalGroup, when set, keeps only socket crystals of that transfusion family.
	CrystalGroup *uint32 `json:"crystalGroup,omitempty"`
	// StatIds narrows to crystals granting every listed stat — picking more stats narrows the
	// list rather than widening it, which is what you want when hunting for one crystal that
	// covers several stats.
	StatIds []model.StatId `json:"statIds,omitempty"`
	// GroupUsage is how many of each transfusion family the preset already holds (group key ->
	// count), so families at their cap can be dropped. The loadout lives in the gear builder,
	// which this source can't reach into, so the caller passes the counts down.
	GroupUsage map[uint32]int `json:"groupUsage,omitempty"`
}

// itemFilters are the item-specific fields carried in ListSourceParams.Filters;
// Category/SubCategory are handled generically by ListSourceParams itself.
type itemFilters struct {
	Grade     *model.ItemGrade `json:"grade,omitempty"`
	ItemType  *model.ItemType  `json:"itemType,omitempty"`
	EquipType string           `json:"equipType,omitempty"`
	Effect    string           `json:"effect,omitempty"`
	// EquipSlots matches items whose EquipInfo.Slot is one of the listed values
	EquipSlots []model.SlotName `json:"equipSlots,omitempty"`
	// Class matches items whose Classes list contains it; empty Classes = usable by all.
	Class string `json:"class,omitempty"`
	// Craftable, when true, keeps only items that have a recipe (the crafting
	// calculator's add-item picker).
	Craftable  bool `json:"craftable,omitempty"`
	Consumable bool `json:"consumable,omitempty"`

	// Crystals filters the list to only items that are transfusion jewels of the given family.
	Crystals *crystalFilters `json:"crystals,omitempty"`
}

// List dispatches to the named source's provider. Returns nil for an
// unregistered source.
func (s *ItemSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	var f itemFilters
	// Empty/absent Filters = zero value = no constraint. A malformed one lands in the same place,
	// which lists everything — deliberately: a filter shape broken by a game update should leave
	// the app usable, not empty. Logged so it's still diagnosable.
	if len(params.Filters) > 0 {
		if err := json.Unmarshal(params.Filters, &f); err != nil {
			log.Printf("List: bad item filters %s: %v", params.Filters, err)
		}
	}

	// We need to handle earing2,artifact2,ring2 etc, mapping to the first slot of the pair.
	for i, slot := range f.EquipSlots {
		if slot.OtherSlot() > 0 {
			f.EquipSlots[i] = model.SlotName(slot.OtherSlot())
		}
	}

	ef := strings.ToLower(strings.TrimSpace(f.Effect))
	pass := func(it *model.Item) bool {
		if it.Name == "" {
			return false
		}

		// hide ghost records (loc name with no item data) and reissued copies
		// of the same item (bound reward/season duplicates) — the canonical
		// (tradeable/base) record represents the item; variants stay reachable
		// via details
		if it.Ghost || it.VariantOf != nil {
			return false
		}

		if params.Category != "" {
			// If we don't match market category, check category instead
			if it.MarketCategory != params.Category {
				noSpaces := strings.ReplaceAll(params.Category, " ", "")
				if it.Category != noSpaces {
					return false
				}
			}
		}
		if params.SubCategory != "" && it.MarketSubCategory != params.SubCategory {
			return false
		}
		if f.Grade != nil && it.Grade != *f.Grade {
			return false
		}
		if f.ItemType != nil && it.ItemType != *f.ItemType {
			return false
		}
		if f.EquipType != "" && (it.EquipInfo == nil || it.EquipInfo.Type != f.EquipType) {
			return false
		}

		if f.Consumable && !it.IsConsumableLike() {
			return false
		}

		// The filter's presence alone means "transfusion jewels only"; its fields narrow further.
		if f.Crystals != nil {
			if it.CrystalGroup == nil {
				return false
			}

			// We're only looking for specific families, ie dawn crystal slots.
			if f.Crystals.CrystalGroup != nil && it.CrystalGroup.Key != *f.Crystals.CrystalGroup {
				return false
			}

			if len(f.Crystals.StatIds) > 0 && !it.HasStatIds(f.Crystals.StatIds...) {
				return false
			}

			// Hide what the builder would refuse anyway — an equip that silently does nothing
			// reads as a broken picker.
			if CrystalRules.GroupFull(it.CrystalGroup, f.Crystals.GroupUsage) {
				return false
			}
		}

		if ef != "" && !it.HasEffect(ef) {
			return false
		}

		if len(f.EquipSlots) > 0 {
			if it.EquipInfo == nil {
				return false
			}

			if !slices.Contains(f.EquipSlots, it.EquipInfo.Slot) {
				return false
			}
		}

		if f.Craftable && (recipe.Instance == nil || !recipe.Instance.IsCraftable(it.GetURN())) {
			return false
		}
		if f.Class != "" && len(it.Classes) > 0 && !slices.Contains(it.Classes, f.Class) {
			return false
		}

		return true
	}

	items := FilterAndRank(
		s.Store.All(),
		params.Query,
		func(it *model.Item) string { return it.Name },
		pass,
		itemLess(params.Sort, params.SortDir),
	)

	out := make([]sources.ListSourceEntry, len(items))
	for i, it := range items {
		out[i] = sources.ListSourceEntry{
			URN:   it.GetURN().String(),
			Title: it.Name,
			Icon:  it.Icon,
			Extra: map[string]any{
				"grade": it.Grade,
			},
		}
	}

	return out
}

// itemLess builds the comparator for FilterAndRank's no-query ordering. Keys are
// ascending "natural" (A→Z, low grade → high, light → heavy); dir "desc" reverses.
// Every key falls back to name; an unknown/empty key sorts by name.
func itemLess(by, dir string) func(a, b *model.Item) bool {
	var less func(a, b *model.Item) bool
	switch by {
	case "grade":
		less = func(a, b *model.Item) bool {
			if a.Grade != b.Grade {
				return a.Grade < b.Grade
			}

			return a.Name < b.Name
		}
	case "weight":
		less = func(a, b *model.Item) bool {
			if a.Weight != b.Weight {
				return a.Weight < b.Weight
			}
			return a.Name < b.Name
		}
	case "consumable":
		less = func(a, b *model.Item) bool {
			if a.Effects != nil && b.Effects != nil {
				aKey := a.Effects.BuffCategories.SortKey()
				aKey += int(a.Grade.Wire())

				bKey := b.Effects.BuffCategories.SortKey()
				bKey += int(b.Grade.Wire())

				if aKey != bKey {
					return aKey < bKey
				}

			}

			if a.Grade != b.Grade {
				return a.Grade < b.Grade
			}

			return a.Name < b.Name
		}
	default:
		less = func(a, b *model.Item) bool {
			return a.Name < b.Name
		}
	}

	if dir == "desc" {
		asc := less
		return func(a, b *model.Item) bool {
			return asc(b, a)
		}
	}

	return less
}

// indexCrystalStatId records a stat key granted by a transfusion jewel, deduped.
func (s *ItemSource) indexCrystalStatId(id model.StatId) {
	if id == "" || slices.Contains(s.UniqueCrystalStatIds, id) {
		return
	}

	s.UniqueCrystalStatIds = append(s.UniqueCrystalStatIds, id)
}

type CrystalStatIdInfo struct {
	StatId model.StatId `json:"statId"`
	Name   string       `json:"name"`
}

func (c *Catalog) GetCrystalStatIds() []CrystalStatIdInfo {
	ids := make([]CrystalStatIdInfo, 0, len(Items.UniqueCrystalStatIds))
	for _, statId := range Items.UniqueCrystalStatIds {
		ids = append(ids, CrystalStatIdInfo{
			StatId: statId,
			Name:   statId.Label(),
		})
	}

	slices.SortFunc(ids, func(a, b CrystalStatIdInfo) int {
		return strings.Compare(a.Name, b.Name)
	})

	return ids
}
