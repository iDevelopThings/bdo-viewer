package catalog

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/idevelopthings/bdo-data-extractor/src/utils"
	"github.com/pkg/errors"

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

	// canonical item URN -> its reissued copies (variantOf links from items.json)
	ItemVariants map[urn.URN][]*model.Item `json:"-"`

	// NPC ID -> items sold by that NPC (vendor)
	ItemVendors map[uint32][]*model.Item `json:"-"`

	ItemType  []string `json:"-"`
	EquipType []string `json:"-"`

	// MarketCategories is the central-market taxonomy (marketcategories.json),
	// the navigation tree's structure; per-category item counts come from
	// CategoryCounts.
	MarketCategories []MarketCategoryWithCount `json:"-"`

	// ByName: a View — pure function of the raw loaded items, computed
	// once on first Get(). Doesn't depend on Build() having run.
	ByName map[string]*model.Item `json:"-"`

	CategoryCounts *models.Reducer[model.Item, map[string]*CategoryCount] `json:"-"`
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
	var enhancements []model.Enhancement
	{
		ijTimed := utils.Timed("[SOURCE] load items.json")
		defer ijTimed()

		if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "items.json"), &items); err != nil {
			return errors.Wrap(err, "read items.json")
		}
	}

	{
		ijTimed := utils.Timed("[SOURCE] load enhancements.json")
		defer ijTimed()

		if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "item_enhancements.json"), &enhancements); err != nil {
			return errors.Wrap(err, "read item_enhancements.json")
		}
	}

	if err := s.loadMarketCategories(); err != nil {
		return err
	}

	s.ItemVendors = make(map[uint32][]*model.Item, 0)
	s.ItemVariants = make(map[urn.URN][]*model.Item)
	s.ItemType = make([]string, 0)
	s.EquipType = make([]string, 0)
	s.ByName = make(map[string]*model.Item)

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

	s.Store = models.NewStore[model.Item](
		len(items), func(u urn.URN) bool {
			return u.Domain == urn.Item.Domain()
		},
	)

	for i := range items {
		it := &items[i]

		if it.VariantOf != nil {
			s.ItemVariants[it.VariantOf.URN] = append(s.ItemVariants[it.VariantOf.URN], it)
		}

		if it.ItemType != "" && !slices.Contains(s.ItemType, it.ItemType) {
			s.ItemType = append(s.ItemType, it.ItemType)
		}
		if it.EquipInfo != nil && it.EquipInfo.Type != "" && !slices.Contains(s.EquipType, it.EquipInfo.Type) {
			s.EquipType = append(s.EquipType, it.EquipInfo.Type)
		}

		if err := s.Store.Add(it.GetURN(), it); err != nil {
			return fmt.Errorf("registering item %d: %w", it.ID, err)
		}
	}

	// Update image paths relative to viewer
	s.Store.AddHook(
		func(it *model.Item) error {
			it.Icon = "/icons/icons/" + strconv.FormatUint(uint64(it.ID), 10) + ".png"
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

	// Build the ItemVendors index (NPC ID -> items sold by that NPC) from the Vendors list in each item.
	s.Store.AddHook(
		func(it *model.Item) error {
			if len(it.Vendors) <= 0 {
				return nil
			}
			for _, vendor := range it.Vendors {
				npcIds := Npcs.ByName.Get()[vendor]
				if len(npcIds) == 0 {
					continue
				}
				for _, npc := range npcIds {
					_, ok := s.ItemVendors[npc.ID]
					if !ok {
						s.ItemVendors[npc.ID] = make([]*model.Item, 0)
					}

					if !slices.ContainsFunc(s.ItemVendors[npc.ID], func(existing *model.Item) bool { return existing.ID == it.ID }) {
						s.ItemVendors[npc.ID] = append(s.ItemVendors[npc.ID], it)
					}
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

// itemFilters are the item-specific fields carried in ListSourceParams.Filters;
// Category/SubCategory are handled generically by ListSourceParams itself.
type itemFilters struct {
	Grade     string `json:"grade,omitempty"`
	ItemType  string `json:"itemType,omitempty"`
	EquipType string `json:"equipType,omitempty"`
	Effect    string `json:"effect,omitempty"`
	// EquipSlots matches items whose EquipInfo.Slot (or any entry of
	// EquipInfo.Slots) is one of the listed values - a UI slot can accept
	// several data slot values (the tool accessory takes lanterns too).
	EquipSlots []string `json:"equipSlots,omitempty"`
	// Class matches items whose Classes list contains it; empty Classes = usable by all.
	Class string `json:"class,omitempty"`
	// Craftable, when true, keeps only items that have a recipe (the crafting
	// calculator's add-item picker).
	Craftable bool `json:"craftable,omitempty"`
}

// List dispatches to the named source's provider. Returns nil for an
// unregistered source.
func (s *ItemSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	var f itemFilters
	_ = json.Unmarshal(params.Filters, &f) // empty/absent Filters = zero value = no constraint

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
		if f.Grade != "" && it.Grade != f.Grade {
			return false
		}
		if f.ItemType != "" && it.ItemType != f.ItemType {
			return false
		}
		if f.EquipType != "" && (it.EquipInfo == nil || it.EquipInfo.Type != f.EquipType) {
			return false
		}
		if ef != "" && !it.HasEffect(ef) {
			return false
		}

		if len(f.EquipSlots) > 0 {
			if it.EquipInfo == nil {
				return false
			}

			if !it.EquipInfo.ContainsSlot(f.EquipSlots...) {
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

		/*return it.Name != "" &&
		(params.Category == "" || it.MarketCategory == params.Category) &&
		(params.SubCategory == "" || it.MarketSubCategory == params.SubCategory) &&
		(f.Grade == "" || it.Grade == f.Grade) &&
		(f.ItemType == "" || it.ItemType == f.ItemType) &&
		(f.EquipType == "" || (it.EquipInfo != nil && it.EquipInfo.Type == f.EquipType)) &&
		(ef == "" || it.HasEffect(ef))*/
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
			ID:       it.ID,
			URN:      urn.Item.New(it.ID).String(),
			Title:    it.Name,
			Subtitle: it.Grade,
			Icon:     it.Icon,
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
		rank := make(map[string]int, len(GradeOrder))
		for i, g := range GradeOrder {
			rank[g] = i
		}
		less = func(a, b *model.Item) bool {
			if ra, rb := rank[a.Grade], rank[b.Grade]; ra != rb {
				return ra < rb
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
