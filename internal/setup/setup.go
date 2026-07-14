// Package setup drives the first-run experience: directory validation, the
// native directory picker, and running the extraction pipeline in-process while
// streaming progress to the frontend over Wails events.
package setup

import (
	"fmt"
	"sync"

	"bdo-viewer/internal/boot"
	"bdo-viewer/internal/catalog"
	"bdo-viewer/internal/config"
	"bdo-viewer/internal/event_reporter"
	"bdo-viewer/internal/updates"

	"github.com/idevelopthings/bdo-data-extractor/pipeline"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Event names streamed to the frontend during extraction.
const (
	EventProgress = "setup:progress"
	EventDone     = "setup:done"
	EventError    = "setup:error"
)

func init() {
	application.RegisterEvent[event_reporter.Progress](EventProgress)
	application.RegisterEvent[struct{}](EventDone)
	application.RegisterEvent[event_reporter.ErrorPayload](EventError)
}

// Service is the bound frontend-facing surface for the setup wizard. It reaches
// the running app via application.Get() rather than holding a reference, since
// services are constructed before application.New returns.
type Service struct {
	mu      sync.Mutex
	running bool

	loadMu sync.Mutex
	loaded bool // whether the extracted dataset is currently in memory
}

func New() *Service {
	return &Service{}
}

// NeedsSetup reports whether the first-run wizard is required.
func (s *Service) NeedsSetup() bool {
	return boot.NeedsSetup()
}

// SetupState tells the frontend whether the setup/extraction flow is required and
// why, so it can show a first-run wizard vs an "an update needs re-extraction"
// prompt. Reason is empty on a first run (or when nothing's needed); otherwise it
// explains the staleness (app updated, or the game was patched).
type SetupState struct {
	NeedsSetup bool   `json:"needsSetup"`
	FirstRun   bool   `json:"firstRun"`
	Reason     string `json:"reason"`
}

// Status reports whether setup is required and why.
func (s *Service) Status() SetupState {
	firstRun, reason := boot.SetupStatus()
	return SetupState{NeedsSetup: firstRun || reason != "", FirstRun: firstRun, Reason: reason}
}

// DefaultGameDir returns the directory to prefill the game-dir picker with: the
// previously configured install if any, else the default Steam path.
func (s *Service) DefaultGameDir() string {
	if config.Global != nil && config.Global.GameDir != "" {
		return config.Global.GameDir
	}
	return pipeline.DefaultGameDir
}

// DefaultDataDir returns the directory to prefill the data-dir picker with.
func (s *Service) DefaultDataDir() string {
	return config.GetExtractedDataDir()
}

// ValidateGameDir confirms dir is a readable BDO install, returning a summary.
func (s *Service) ValidateGameDir(dir string) (pipeline.Meta, error) {
	return pipeline.ValidateGameDir(dir)
}

// AvailableLanguages lists the localization languages present in a game install.
func (s *Service) AvailableLanguages(dir string) ([]string, error) {
	return pipeline.AvailableLanguages(dir)
}

// AvailableRegions lists the region-variant suffixes a game install ships client
// data for (regionclientdata_<region>_.xml), e.g. na, kr, eu — for the wizard's
// and settings' region picker. Empty means only the base file exists.
func (s *Service) AvailableRegions(dir string) ([]string, error) {
	return pipeline.AvailableRegions(dir)
}

// PickDirectory opens the native directory picker and returns the chosen path
// (empty string if the user cancels).
func (s *Service) PickDirectory(title string) (string, error) {
	dialog := application.Get().Dialog.OpenFile()
	dialog.CanChooseDirectories(true)
	dialog.CanChooseFiles(false)
	if title != "" {
		dialog.SetTitle(title)
	}
	return dialog.PromptForSingleSelection()
}

// RunExtraction validates inputs, persists the chosen directories, then runs the
// pipeline in a background goroutine, streaming progress over Wails events and
// loading the dataset on success. It returns immediately; completion arrives via
// the setup:done / setup:error events. Only one run may be in flight at a time —
// the pipeline drives process-global state (config + progress sink).
func (s *Service) RunExtraction(gameDir, dataDir, lang, region string) error {
	if _, err := pipeline.ValidateGameDir(gameDir); err != nil {
		return fmt.Errorf("invalid game directory: %w", err)
	}
	if dataDir == "" {
		dataDir = config.GetExtractedDataDir()
	}
	if lang == "" {
		lang = "en"
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("an extraction is already running")
	}
	s.running = true
	s.mu.Unlock()

	config.Update(func(c *config.Config) {
		c.GameDir = gameDir
		c.ExtractedDataDir = dataDir
		c.DataRegion = &region
	})

	go func() {
		defer func() {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}()

		reporter := event_reporter.NewEventReporter(
			EventProgress,
			EventError,
			EventDone,
		)
		pipeline.SetReporter(reporter)

		// The world-map tiles are served straight out of open pack handles, and the
		// run rewrites worldmap/ in place — Windows refuses to unlink a file we still
		// hold open. Release them for the duration; tiles 404 until it finishes.
		catalog.SuspendAssets()
		defer catalog.ResumeAssets()

		if err := pipeline.RunAll(pipeline.Options{GameDir: gameDir, DataDir: dataDir, Lang: lang, Region: region, AppVersion: updates.Version}); err != nil {
			reporter.Error(event_reporter.ErrorPayload{Message: err.Error()})
			return
		}

		// Extraction only writes the JSON to disk. Loading it into memory is a
		// separate step the frontend drives (its load screen) once the wizard closes,
		// so just mark any prior in-memory dataset stale — the next LoadData reloads
		// the fresh data.
		s.loadMu.Lock()
		s.loaded = false
		s.loadMu.Unlock()

		reporter.Done()
	}()

	return nil
}

// LoadData loads the extracted dataset into memory and returns when it's done, so the
// frontend can await it and then show the app. It's idempotent — a no-op if the data
// is already loaded — so React re-mounts (StrictMode in dev, an F5 reload) don't
// reload needlessly. Progress streams over the load:* events for the loading screen.
// Concurrent calls serialize on loadMu; a second caller returns as soon as the first
// finishes loading.
func (s *Service) LoadData() error {
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	if s.loaded {
		return nil
	}
	if err := boot.LoadData(); err != nil {
		return err
	}
	s.loaded = true
	return nil
}

// ForceLoadData reloads the dataset from disk even when it's already in memory — for
// an explicit "reload" that the idempotent LoadData would skip.
func (s *Service) ForceLoadData() error {
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	s.loaded = false
	if err := boot.LoadData(); err != nil {
		return err
	}
	s.loaded = true
	return nil
}
