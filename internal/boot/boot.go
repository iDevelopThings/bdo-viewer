// Package boot holds the data-loading steps shared between startup and the setup
// service: NeedsSetup decides whether the first-run wizard is required, and
// LoadData brings the extracted dataset into memory. Keeping them here (rather
// than in package main) lets the setup service reload after an extraction.
package boot

import (
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"

	"bdo-viewer/internal/config"
	"bdo-viewer/internal/event_reporter"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/updates"
	"bdo-viewer/internal/util"

	"github.com/idevelopthings/bdo-data-extractor/pipeline"
	"github.com/idevelopthings/bdo-data-extractor/src/models"
)

const (
	EventLoadProgress = "load:progress"
	EventLoadDone     = "load:done"
	EventLoadError    = "load:error"
)

func init() {
	application.RegisterEvent[event_reporter.Progress](EventLoadProgress)
	application.RegisterEvent[struct{}](EventLoadDone)
	application.RegisterEvent[event_reporter.ErrorPayload](EventLoadError)
}

// SetupStatus reports whether the setup/extraction flow must run before the data can
// be loaded, and — when it's a re-extraction of an existing but stale dataset rather
// than a first run — why. firstRun is true when no dataset exists yet; reason is a
// human-readable explanation when a dataset exists but is stale (the game was
// patched, or this app updated since extraction, tracked via the data dir manifest).
// A game dir that can't be read leaves the existing data in place — a re-extraction
// isn't possible anyway — so reason stays empty there.
func SetupStatus() (firstRun bool, reason string) {
	dataDir := config.GetExtractedDataDir()
	if _, err := os.Stat(filepath.Join(dataDir, "items.json")); err != nil {
		return true, "" // no dataset yet — genuine first run
	}

	gameDir := ""
	if config.Global != nil {
		gameDir = config.Global.GameDir
	}
	stale, reason := pipeline.NeedsExtraction(dataDir, gameDir, updates.Version)
	if !stale {
		return false, ""
	}
	log.Printf("bdo-viewer: dataset stale (%s) — re-extraction required", reason)

	return false, reason
}

// NeedsSetup reports whether the setup/extraction flow must run — a first run, or a
// stale dataset. See SetupStatus for the first-run/stale distinction.
func NeedsSetup() bool {
	firstRun, reason := SetupStatus()
	return firstRun || reason != ""
}

// LoadData (re)loads every source's JSON and runs the cross-store build. It resets
// the models registry first, so calling it again after a re-extraction rebuilds
// the same clean state as a fresh process rather than stacking a second set of
// stores on the first. Callers holding cached store references (e.g. the recipe
// resolver) must revalidate them after this returns.
func LoadData() error {
	reporter := event_reporter.NewEventReporter(
		EventLoadProgress, EventLoadError, EventLoadDone,
	)

	reporter.Phase("start")

	reporter.Phase("Resetting registry")
	models.Reset()

	if err := sources.Registry.LoadAll(reporter); err != nil {
		reporter.Error(event_reporter.ErrorPayload{Message: err.Error()})
		return err
	}

	reporter.Phase("Running model hooks")
	if err := models.Build(); err != nil {
		reporter.Error(event_reporter.ErrorPayload{Message: err.Error()})
		return err
	}

	reporter.Done()

	util.DumpJSONLoadTimes()

	return nil
}
