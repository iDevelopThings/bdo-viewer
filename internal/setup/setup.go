// Package setup drives the first-run experience: directory validation, the
// native directory picker, and running the extraction pipeline in-process while
// streaming progress to the frontend over Wails events.
package setup

import (
	"fmt"
	"sync"
	"time"

	"bdo-viewer/internal/boot"
	"bdo-viewer/internal/config"
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
	application.RegisterEvent[Progress](EventProgress)
	application.RegisterEvent[struct{}](EventDone)
	application.RegisterEvent[ErrorPayload](EventError)
}

// Progress is one update in the setup:progress stream. Step/Steps track the
// top-level command (1..5); Phase names the current sub-stage; Done/Total carry
// per-item counts when a stage reports them; Log carries a freeform status line.
type Progress struct {
	Step  int    `json:"step"`
	Steps int    `json:"steps"`
	Phase string `json:"phase"`
	Done  int64  `json:"done"`
	Total int64  `json:"total"`
	Log   string `json:"log,omitempty"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

// Service is the bound frontend-facing surface for the setup wizard. It reaches
// the running app via application.Get() rather than holding a reference, since
// services are constructed before application.New returns.
type Service struct {
	mu      sync.Mutex
	running bool
}

func New() *Service {
	return &Service{}
}

// NeedsSetup reports whether the first-run wizard is required.
func (s *Service) NeedsSetup() bool {
	return boot.NeedsSetup()
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
func (s *Service) RunExtraction(gameDir, dataDir, lang string) error {
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
	})

	go func() {
		defer func() {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}()

		pipeline.SetReporter(&eventReporter{})

		if err := pipeline.RunAll(pipeline.Options{GameDir: gameDir, DataDir: dataDir, Lang: lang, AppVersion: updates.Version}); err != nil {
			application.Get().Event.Emit(EventError, ErrorPayload{Message: err.Error()})
			return
		}

		// LoadData resets the models registry first, so this rebuilds cleanly
		// whether it's the first load or a reload after re-extraction.
		if err := boot.LoadData(); err != nil {
			application.Get().Event.Emit(EventError, ErrorPayload{Message: err.Error()})
			return
		}
		application.Get().Event.Emit(EventDone, struct{}{})
	}()

	return nil
}

// eventReporter adapts the pipeline's progress sink to Wails events. Per-item
// Progress can fire thousands of times, so it's throttled; Step/Phase/Log always
// emit. Reporter methods are called from multiple worker goroutines, so state is
// mutex-guarded.
type eventReporter struct {
	mu       sync.Mutex
	step     int
	steps    int
	phase    string
	lastEmit time.Time
}

func (r *eventReporter) Step(index, total int, phase string) {
	r.mu.Lock()
	r.step, r.steps, r.phase = index, total, phase
	p := Progress{Step: index, Steps: total, Phase: phase}
	r.mu.Unlock()
	application.Get().Event.Emit(EventProgress, p)
}

func (r *eventReporter) Phase(name string) {
	r.mu.Lock()
	r.phase = name
	p := Progress{Step: r.step, Steps: r.steps, Phase: name}
	r.mu.Unlock()
	application.Get().Event.Emit(EventProgress, p)
}

func (r *eventReporter) Progress(done, total int64) {
	r.mu.Lock()
	final := total > 0 && done >= total
	if !final && time.Since(r.lastEmit) < 100*time.Millisecond {
		r.mu.Unlock()
		return
	}
	r.lastEmit = time.Now()
	p := Progress{Step: r.step, Steps: r.steps, Phase: r.phase, Done: done, Total: total}
	r.mu.Unlock()
	application.Get().Event.Emit(EventProgress, p)
}

func (r *eventReporter) Log(line string) {
	r.mu.Lock()
	p := Progress{Step: r.step, Steps: r.steps, Phase: r.phase, Log: line}
	r.mu.Unlock()
	application.Get().Event.Emit(EventProgress, p)
}
