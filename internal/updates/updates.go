// Package updates wires the app to GitHub-released builds via Wails v3's native
// updater: it configures the update source and exposes a small bound service the
// frontend drives (check / download+install / restart). Verification is by the
// checksums.txt sidecar the release ships; the update swap, staging and restart
// are handled by the framework.
package updates

import (
	"context"
	"os"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// Repo is the GitHub "owner/repo" releases are published to and pulled from.
const Repo = "idevelopthings/bdo-viewer"

// Version is the running build's version, injected at build time via
//
//	-ldflags "-X bdo-viewer/internal/updates.Version=<tag>"
//
// Unset (dev) builds keep "dev", which disables the updater — there's no
// meaningful version to compare against a release.
var Version = "dev"

const checkInterval = 6 * time.Hour

// enabled reports whether this build participates in auto-updates.
func enabled() bool {
	return Version != "dev"
}

// Configure points the app's updater at the GitHub releases for Repo. It's a
// no-op for dev builds. Call once, after application.New.
func Configure(app *application.App) error {
	if !enabled() {
		return nil
	}

	gh, err := github.New(github.Config{
		Repository:    Repo,
		ChecksumAsset: "checksums.txt",
		// BDO_UPDATE_BASEURL overrides the GitHub API host — for pointing a local
		// build at a mock release server to test the update flow before publishing.
		BaseURL: os.Getenv("BDO_UPDATE_BASEURL"),
	})
	if err != nil {
		return err
	}

	return app.Updater.Init(updater.Config{
		CurrentVersion: Version,
		Providers:      []updater.Provider{gh},
		CheckInterval:  checkInterval,
	})
}

// Service is the bound frontend surface for updates.
type Service struct{}

func New() *Service {
	return &Service{}
}

// CurrentVersion returns the running build's version.
func (s *Service) CurrentVersion() string {
	return Version
}

// Check looks for a newer release now, returning it when one is available (nil
// when up to date or on a dev build). Progress/among the wails:updater:* events.
func (s *Service) Check() (*updater.Release, error) {
	if !enabled() {
		return nil, nil
	}
	return application.Get().Updater.Check(context.Background())
}

// DownloadAndInstall downloads, verifies and stages the update; download progress
// arrives via the wails:updater:download-progress event. Call Restart to apply it.
func (s *Service) DownloadAndInstall() error {
	if !enabled() {
		return nil
	}
	return application.Get().Updater.DownloadAndInstall(context.Background())
}

// Restart relaunches into the staged update.
func (s *Service) Restart() error {
	if !enabled() {
		return nil
	}
	return application.Get().Updater.Restart(context.Background())
}
