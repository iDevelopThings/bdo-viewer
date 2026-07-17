package util

import (
	"sync"
	"time"
)

type Debouncer struct {
	d          time.Duration
	f          func()
	mu         sync.Mutex
	t          *time.Timer
	suppressed bool
}

func NewDebouncer(d time.Duration, f func()) *Debouncer {
	return &Debouncer{d: d, f: f}
}

func (b *Debouncer) Suppress(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.suppressed = v
}

func (b *Debouncer) Trigger() {
	b.mu.Lock()

	if b.suppressed {
		b.t = nil
		b.mu.Unlock()
		return
	}

	defer b.mu.Unlock()
	if b.t == nil {
		b.t = time.AfterFunc(b.d, b.f)
	} else {
		b.t.Reset(b.d)
	}
}

// Flush runs f now if a save was pending. Safe to call multiple times.
func (b *Debouncer) Flush() {
	b.mu.Lock()
	stop := b.t != nil && b.t.Stop()
	b.mu.Unlock()
	if stop {
		b.f() // outside b.mu — f may be slow, and shouldn't deadlock on Trigger
	}
}
