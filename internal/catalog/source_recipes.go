package catalog

import (
	"fmt"
	"path/filepath"
	"sort"

	"github.com/pkg/errors"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/util"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
	"github.com/idevelopthings/bdo-data-extractor/src/urn"
)

// RecipeSource owns the crafting-recipe table. Recipes aren't browsed on their
// own — they surface through an item's detail (recipe.Resolver reads this
// store) — so the source contributes no sidebar navigation, but it still owns
// recipes.json and registers the Store[Recipe] the resolver resolves against.
type RecipeSource struct {
	*sources.BaseSource

	Store *models.Store[model.Recipe] `json:"-"`
}

var (
	_ sources.Source = (*RecipeSource)(nil)

	Recipes *RecipeSource
)

func NewRecipeSource() *RecipeSource {
	Recipes = &RecipeSource{
		BaseSource: &sources.BaseSource{
			Kind: sources.Recipe,
			URN:  sources.NewSourceURN(urn.Recipe, "", ""),
		},
	}

	return Recipes
}

func (s *RecipeSource) GetSourceKind() sources.SourceKind { return s.Kind }

// Load reads recipes.json (extractor output: ByproductOf flag set, inverted
// imperial-delivery recipes already removed) into the Store the resolver keys
// off.
func (s *RecipeSource) Load() error {
	var recipes []*model.Recipe
	if err := util.ReadJSON(filepath.Join(config.GetExtractedDataDir(), "recipes.json"), &recipes); err != nil {
		return errors.Wrap(err, "read recipes.json")
	}

	s.Store = models.NewStore[model.Recipe](
		len(recipes), func(u urn.URN) bool {
			return u.Domain == urn.Recipe.Domain()
		},
	)

	for _, r := range recipes {
		if err := s.Store.Add(r.GetURN(), r); err != nil {
			return fmt.Errorf("registering recipe %s: %w", r.GetURN(), err)
		}
	}

	models.RegisterStore(s.Store)

	return nil
}

// GetNavigationTree returns an empty node — recipes have no sidebar section
// (the registry skips sources whose nav root has no id).
func (s *RecipeSource) GetNavigationTree() sources.SourceNavigationNodeSimple {
	return sources.SourceNavigationNodeSimple{}
}

func (s *RecipeSource) GetEntry(ref urn.URN) sources.ISourceEntry {
	r, ok := s.Store.Get(ref)
	return sources.NewEntry(s.Kind, ref, r, ok)
}

func (s *RecipeSource) GetEntryDetails(ref urn.URN, outDetails *map[string]any) bool {
	r, ok := s.Store.Get(ref)
	if !ok {
		return false
	}
	(*outDetails)[string(s.Kind)] = r
	return true
}

func (s *RecipeSource) List(params sources.ListSourceParams) []sources.ListSourceEntry {
	recs := s.Store.All()
	out := make([]sources.ListSourceEntry, 0, len(recs))
	for _, r := range recs {
		out = append(out, sources.ListSourceEntry{
			URN:   r.GetURN().String(),
			Title: r.Type,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Title < out[j].Title })

	return out
}
