package catalog

import (
	"bdo-viewer/internal/sources"
	"github.com/idevelopthings/bdo-data-extractor/pipeline"
)

func init() {
	sources.Registry.RegisterSource(NewRecipeSource())
	sources.Registry.RegisterSource(NewItemSource())
	sources.Registry.RegisterSource(NewGrindSpotSource())
	sources.Registry.RegisterSource(NewNpcSource())
	sources.Registry.RegisterSource(NewKnowledgeSource())
	sources.Registry.RegisterSource(NewWorldRegionSource())
	sources.Registry.RegisterSource(NewCharacterSource())
	sources.Registry.RegisterSource(NewMasterySource())
	sources.Registry.RegisterSource(NewCrystalRulesSource())
}

var eventReporter pipeline.Reporter = pipeline.GetLogReporter()

func SetEventReporter(r pipeline.Reporter) {
	if r == nil {
		eventReporter = pipeline.GetLogReporter()
		return
	}

	eventReporter = r
}
