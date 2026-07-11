package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

var (
	Global *Config

	// lastSaved is the JSON of the most recently written state, so SaveIfChanged can
	// skip no-op writes.
	lastSaved []byte
)

type Config struct {
	ExtractedDataDir string       `json:"extracted_data_dir,omitempty"`
	GameDir          string       `json:"game_dir,omitempty"`
	Window           *WindowState `json:"window,omitempty"`
	Player           *PlayerInfo  `json:"player,omitempty"`

	MarketRegion *string `json:"market_region,omitempty"`
}

// appDir is the viewer's per-user folder name.
const appDir = "bdo-viewer"

// Dir is the single base directory for everything the viewer stores per user —
// settings (config.json) and the extracted dataset alike. It sits under the OS
// cache dir (Local AppData on Windows): the extracted data is large and
// regenerable, so it must not roam, and keeping settings beside it means one
// location. Every other path derives from Dir — the single source of truth.
func Dir() string {
	base, err := os.UserCacheDir()
	if err != nil {
		base = "."
	}

	return filepath.Join(base, appDir)
}
func File() string { return filepath.Join(Dir(), "config.json") }

func Load() error {
	data, err := os.ReadFile(File())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}

		return fmt.Errorf("read settings: %w", err)
	}

	var s Config
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("parse settings: %w", err)
	}

	Global = &s
	lastSaved, _ = json.MarshalIndent(Global, "", "  ") // baseline so autosave doesn't rewrite an unchanged load

	return nil
}

func Update(fn func(*Config)) {
	if Global == nil {
		Global = &Config{}
	}

	fn(Global)

	err := SaveIfChanged()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to save config: %v\n", err)
	}

}

// Save writes Global to disk unconditionally (creating the config dir if needed).
func Save() error {
	data, err := json.MarshalIndent(Global, "", "  ")
	if err != nil {
		return fmt.Errorf("encode settings: %w", err)
	}

	return writeBytes(data)
}

// SaveIfChanged writes Global only when it differs from the last write — cheap
// enough to call on an autosave tick.
func SaveIfChanged() error {
	data, err := json.MarshalIndent(Global, "", "  ")
	if err != nil {
		return fmt.Errorf("encode settings: %w", err)
	}
	if bytes.Equal(data, lastSaved) {
		return nil
	}

	return writeBytes(data)
}

// SaveIfDirty for frontend wails bindings
func (c *Config) SaveIfDirty() error {
	return SaveIfChanged()
}

func writeBytes(data []byte) error {
	if err := os.MkdirAll(Dir(), 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	if err := os.WriteFile(File(), data, 0o644); err != nil {
		return fmt.Errorf("write settings: %w", err)
	}
	lastSaved = data

	return nil
}

// defaultDataDir is where extraction lands when the user hasn't chosen a location:
// the data subdirectory of the viewer's base dir.
func defaultDataDir() string {
	return filepath.Join(Dir(), "data")
}

func GetExtractedDataDir() string {
	if Global != nil && Global.ExtractedDataDir != "" {
		return Global.ExtractedDataDir
	}
	return defaultDataDir()
}

// GetExtractedDataDir (bound) exposes the resolved data dir to the frontend.
func (c *Config) GetExtractedDataDir() string {
	return GetExtractedDataDir()
}

// SetExtractedDataDir persists a user-chosen data directory.
func (c *Config) SetExtractedDataDir(dir string) error {
	c.ExtractedDataDir = dir
	return SaveIfChanged()
}

func (c *Config) GetGameDir() string {
	return c.GameDir
}

// SetGameDir persists the user's BDO install directory.
func (c *Config) SetGameDir(dir string) error {
	c.GameDir = dir
	return SaveIfChanged()
}

func (c *Config) GetMarketRegion() string {
	if c == nil || c.MarketRegion == nil {
		return "NA"
	}
	return *c.MarketRegion
}

// SetMarketRegion updates the central-market region and persists it.
func (c *Config) SetMarketRegion(region string) error {
	c.MarketRegion = &region
	return SaveIfChanged()
}
