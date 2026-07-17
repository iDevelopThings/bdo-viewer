package event_reporter

import (
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/idevelopthings/bdo-data-extractor/pipeline"
)

// Progress is one update in the setup:progress stream. Step/Steps track the
// top-level command (1..5); Phase names the current substage; Done/Total carry
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

// EventReporter adapts the pipeline's progress sink to Wails events. Per-item
// Progress can fire thousands of times, so it's throttled; Step/Phase/Log always
// emit. Reporter methods are called from multiple worker goroutines, so state is
// mutex-guarded.
type EventReporter struct {
	mu       sync.Mutex
	step     int
	steps    int
	phase    string
	lastEmit time.Time

	progressEventName string
	errorEventName    string
	doneEventName     string
}

func NewEventReporter(
	progressEventName string,
	errorEventName string,
	doneEventName string,
) *EventReporter {
	return &EventReporter{
		progressEventName: progressEventName,
		errorEventName:    errorEventName,
		doneEventName:     doneEventName,
	}
}

var logReporter = pipeline.GetLogReporter()

func (r *EventReporter) Error(payload ErrorPayload) {
	if r == nil {
		logReporter.Log(payload.Message)
		return
	}
	application.Get().Event.Emit(r.errorEventName, payload)
	logReporter.Log(payload.Message)
}

func (r *EventReporter) Done() {
	if r == nil {
		return
	}
	application.Get().Event.Emit(r.doneEventName, struct{}{})
	logReporter.Log("Done")
}

func (r *EventReporter) Step(index, total int, phase string) {
	if r == nil {
		logReporter.Step(index, total, phase)
		return
	}
	r.mu.Lock()
	r.step, r.steps, r.phase = index, total, phase
	p := Progress{Step: index, Steps: total, Phase: phase}
	r.mu.Unlock()
	application.Get().Event.Emit(r.progressEventName, p)

	// Also push to CLI for dev
	logReporter.Step(index, total, phase)
}

func (r *EventReporter) Phase(name string) {
	if r == nil {
		logReporter.Phase(name)
		return
	}
	r.mu.Lock()
	r.phase = name
	p := Progress{Step: r.step, Steps: r.steps, Phase: name}
	r.mu.Unlock()
	application.Get().Event.Emit(r.progressEventName, p)

	// Also push to CLI for dev
	logReporter.Phase(name)
}

func (r *EventReporter) Progress(done, total int64) {
	if r == nil {
		return
	}
	r.mu.Lock()
	final := total > 0 && done >= total
	if !final && time.Since(r.lastEmit) < 100*time.Millisecond {
		r.mu.Unlock()
		return
	}
	r.lastEmit = time.Now()
	p := Progress{Step: r.step, Steps: r.steps, Phase: r.phase, Done: done, Total: total}
	r.mu.Unlock()
	application.Get().Event.Emit(r.progressEventName, p)

}

func (r *EventReporter) Log(line string) {
	if r == nil {
		logReporter.Log(line)
		return
	}
	r.mu.Lock()
	p := Progress{Step: r.step, Steps: r.steps, Phase: r.phase, Log: line}
	r.mu.Unlock()
	application.Get().Event.Emit(r.progressEventName, p)

	// Also push to CLI for dev
	logReporter.Log(line)
}
