package catalog

import "bdo-viewer/internal/sources"

func init() {
	sources.Registry.RegisterSource(NewRecipeSource())
	sources.Registry.RegisterSource(NewItemSource())
	sources.Registry.RegisterSource(NewGrindSpotSource())
	sources.Registry.RegisterSource(NewNpcSource())
	sources.Registry.RegisterSource(NewKnowledgeSource())
	sources.Registry.RegisterSource(NewWorldRegionSource())
	sources.Registry.RegisterSource(NewCharacterSource())
	sources.Registry.RegisterSource(NewMasterySource())
}
