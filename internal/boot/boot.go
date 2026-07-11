// Package boot holds the data-loading steps shared between startup and the setup
// service: NeedsSetup decides whether the first-run wizard is required, and
// LoadData brings the extracted dataset into memory. Keeping them here (rather
// than in package main) lets the setup service reload after an extraction.
package boot

import (
	"os"
	"path/filepath"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"

	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

// NeedsSetup reports whether the first-run wizard must be shown — true when the
// extracted dataset is absent (items.json is the marker every load depends on).
// A configured game dir is only needed to extract, not to run, so it isn't checked.
func NeedsSetup() bool {
	_, err := os.Stat(filepath.Join(config.GetExtractedDataDir(), "items.json"))
	return err != nil
}

// LoadData (re)loads every source's JSON and runs the cross-store build. It resets
// the models registry first, so calling it again after a re-extraction rebuilds
// the same clean state as a fresh process rather than stacking a second set of
// stores on the first. Callers holding cached store references (e.g. the recipe
// resolver) must revalidate them after this returns.
func LoadData() error {
	models.Reset()
	if err := sources.Registry.LoadAll(); err != nil {
		return err
	}
	return models.Build()
}
