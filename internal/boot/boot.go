// Package boot holds the data-loading steps shared between startup and the setup
// service: NeedsSetup decides whether the first-run wizard is required, and
// LoadData brings the extracted dataset into memory. Keeping them here (rather
// than in package main) lets the setup service reload after an extraction.
package boot

import (
	"log"
	"os"
	"path/filepath"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/updates"

	"github.com/idevelopthings/bdo-data-extractor/pipeline"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

// NeedsSetup reports whether the setup/extraction flow must run before the data can
// be loaded. That's true on a genuine first run (no dataset yet), and also when the
// existing dataset is stale — the game has been patched, or this app has updated
// since the data was extracted (tracked via the data dir's manifest). A game dir
// that can't be read leaves the existing data in place (a re-extraction isn't
// possible anyway), so a moved/offline install still runs.
func NeedsSetup() bool {
	dataDir := config.GetExtractedDataDir()
	if _, err := os.Stat(filepath.Join(dataDir, "items.json")); err != nil {
		return true // no dataset yet — genuine first run
	}

	gameDir := ""
	if config.Global != nil {
		gameDir = config.Global.GameDir
	}
	stale, reason := pipeline.NeedsExtraction(dataDir, gameDir, updates.Version)
	if stale {
		log.Printf("bdo-viewer: dataset stale (%s) — re-extraction required", reason)
	}

	return stale
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
