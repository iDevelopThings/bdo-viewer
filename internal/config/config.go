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
	// DataRegion is the region-variant the extractor loads client data for
	// (regionclientdata_<region>_.xml, e.g. "na"). It is distinct from MarketRegion
	// (the price-API region) and applies on the next extraction. Empty means "use
	// the localization language".
	DataRegion *string `json:"data_region,omitempty"`
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

func WriteJsonConfig[T any](value *T, filename string) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config file error: %w", err)
	}

	path := filepath.Join(Dir(), filename)
	if err := os.MkdirAll(Dir(), 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write config file error: %w", err)
	}

	return nil
}
// ReadRawJsonConfig returns the file's bytes (nil if it doesn't exist yet) for callers that
// version their state and need to migrate the document before it will decode.
func ReadRawJsonConfig(filename string) ([]byte, error) {
	path := filepath.Join(Dir(), filename)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read config file error: %w", err)
	}

	return data, nil
}

func ReadJsonConfig[T any](filename string) (*T, error) {
	data, err := ReadRawJsonConfig(filename)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, nil
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, fmt.Errorf("parse config file error: %w", err)
	}

	return &value, nil
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

// GetDataRegion returns the extractor's region variant, or "" when unset (meaning
// the localization language is used as the region).
func (c *Config) GetDataRegion() string {
	if c == nil || c.DataRegion == nil {
		return ""
	}
	return *c.DataRegion
}

// SetDataRegion persists the region variant the extractor loads client data for.
// It takes effect on the next extraction.
func (c *Config) SetDataRegion(region string) error {
	c.DataRegion = &region
	return SaveIfChanged()
}
