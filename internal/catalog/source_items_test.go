package catalog

import (
	"reflect"
	"testing"

	"github.com/idevelopthings/bdo-data-extractor/src/model"
	"github.com/idevelopthings/bdo-data-extractor/src/models"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/stats"
)

func TestItemSource_GetStats(t *testing.T) {

	err := config.Load()
	if err != nil {
		t.Fatal("Failed to load config: ", err)
	}

	_, err = New()
	if err != nil {
		t.Fatal("Failed to load catalog..: ", err)
	}

	if err := sources.Registry.LoadAll(nil); err != nil {
		t.Fatal("Failed to load sources: ", err)
	}

	// Build runs every store's cross-referencing hooks now that all sources
	// have loaded (item icon/vendor indexes, etc.). Must precede any consumer
	// that reads a resolved store.
	if err = models.Build(); err != nil {
		t.Fatal("Failed to build stores: ", err)
	}

	bsBlade := Items.ByName["Blackstar Blade"]
	esNouverBow := Items.ByName["Earthshaking Nouver Horn Bow"]

	type args struct {
		item *model.Item
	}
	tests := []struct {
		name string
		args args
		want []stats.StatGroup
	}{
		{
			name: "Blackstar Blade",
			args: args{
				item: bsBlade,
			},
		},
		{
			name: "Earthshaking Nouver Horn Bow",
			args: args{
				item: esNouverBow,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := tt.args.item.GetMaxEnhancement()
			if e == nil {
				t.Fatal("Failed to get max enhancement for item: ", tt.args.item.Name)
			}
			got := Items.GetStats(tt.args.item.Urn, e.Level, 0)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("GetStats() = %v, want %v", got, tt.want)
			}
		})
	}
}
