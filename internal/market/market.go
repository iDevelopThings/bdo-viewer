// Package market provides live central-market prices for the crafting calculator.
// This is the one piece of data that isn't in the client — the market economy is
// server-side and live — so it's fetched from the bdolytics API on demand and
// cached in memory. It's fetched server-side (in Go) rather than from the webview
// so there's no CORS wrangling, and it's never persisted: the extractor's cached
// data stays purely client-sourced.
package market

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"bdo-viewer/internal/config"
)

// Entry is one item's live central-market listing.
type Entry struct {
	Price  int64 `json:"price"`
	Trades int64 `json:"trades"`
	Stock  int64 `json:"stock"`
}

// Status is the cache's current state, for the frontend's load indicator.
type Status struct {
	Region  string     `json:"region"`
	Count   int        `json:"count"`
	Fetched *time.Time `json:"fetched,omitempty"`
	Loading bool       `json:"loading"`
	Error   string     `json:"error,omitempty"`
}

// Service is the in-memory market-price cache. The zero value isn't usable; call
// New. Safe for concurrent use.
type Service struct {
	mu      sync.RWMutex
	byID    map[uint32]Entry
	region  string
	fetched *time.Time
	loading bool
	lastErr string

	client *http.Client
}

func New() *Service {
	return &Service{
		byID:   map[uint32]Entry{},
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

// Status returns the current cache state.
func (s *Service) Status() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.status()
}

// status assumes the lock is held.
func (s *Service) status() Status {
	return Status{
		Region:  s.region,
		Count:   len(s.byID),
		Fetched: s.fetched,
		Loading: s.loading,
		Error:   s.lastErr,
	}
}

// Fetch pulls the central-market snapshot for region (empty = the configured
// region) and replaces the cache. A fetch already in flight is a no-op that
// returns the current status. It's a bound method — the frontend calls it to
// (re)load prices.
func (s *Service) Fetch(region string) (Status, error) {
	if region == "" {
		region = config.Global.GetMarketRegion()
	}

	s.mu.Lock()
	if s.loading {
		st := s.status()
		s.mu.Unlock()
		return st, nil
	}
	s.loading = true
	s.lastErr = ""
	s.region = region
	s.mu.Unlock()

	byID, err := s.load(context.Background(), region)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.loading = false
	if err != nil {
		s.lastErr = err.Error()
		return s.status(), err
	}
	s.byID = byID
	s.fetched = new(time.Now())

	return s.status(), nil
}

// Price returns an item's live listing and whether it's currently listed.
func (s *Service) Price(u urn.URN) (Entry, bool) {
	id, err := u.Uint32()
	if err != nil {
		return Entry{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.byID[id]

	return e, ok
}

// Snapshot returns the whole cached price map, keyed by item URN — the frontend
// loads it once after Fetch so per-item lookups stay synchronous.
func (s *Service) Snapshot() map[urn.URN]Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[urn.URN]Entry, len(s.byID))
	for id, e := range s.byID {
		out[urn.Item.New(id)] = e
	}

	return out
}

// Prices resolves a batch of item URNs to their listings, omitting any that
// aren't listed. Keyed by URN so the frontend can look up its BOM entries
// directly.
func (s *Service) Prices(urns []urn.URN) map[urn.URN]Entry {
	out := make(map[urn.URN]Entry, len(urns))
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range urns {
		id, err := u.Uint32()
		if err != nil {
			continue
		}
		if e, ok := s.byID[id]; ok {
			out[u] = e
		}
	}

	return out
}

// load fetches and parses the bdolytics central-market snapshot for region.
func (s *Service) load(ctx context.Context, region string) (map[uint32]Entry, error) {
	url := fmt.Sprintf("https://apiv2.bdolytics.com/en/%s/market/central-market-data", region)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	// bdolytics rejects the default Go user-agent (403); it expects a browser-like
	// client (the old in-webview fetch worked because the webview sent one).
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) bdo-viewer")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bdolytics: http %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return parsePayload(body)
}

type marketPayload struct {
	Data []struct {
		ItemID           uint32 `json:"item_id"`
		SubID            int    `json:"sub_id"`
		EnhancementLevel int    `json:"enhancement_level"`
		Price            int64  `json:"price"`
		TotalTrades      int64  `json:"total_trades"`
		InStock          int64  `json:"in_stock"`
	} `json:"data"`
}

// parsePayload decodes a bdolytics central-market response, keeping only the
// base, un-enhanced, non-variant row per item (enhancement_level == 0 &&
// sub_id == 0) — the price relevant to crafting materials/consumables.
func parsePayload(body []byte) (map[uint32]Entry, error) {
	var p marketPayload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("decode market payload: %w", err)
	}

	byID := make(map[uint32]Entry, len(p.Data))
	for _, d := range p.Data {
		if d.EnhancementLevel != 0 || d.SubID != 0 {
			continue
		}
		byID[d.ItemID] = Entry{Price: d.Price, Trades: d.TotalTrades, Stock: d.InStock}
	}

	return byID, nil
}
