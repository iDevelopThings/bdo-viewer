package main

import (
	"embed"
	"log"
	"time"

	"bdo-viewer/internal/catalog"
	"bdo-viewer/internal/config"
	"bdo-viewer/internal/gear"
	"bdo-viewer/internal/market"
	"bdo-viewer/internal/recipe"
	"bdo-viewer/internal/setup"
	"bdo-viewer/internal/sources"
	"bdo-viewer/internal/updates"

	"github.com/idevelopthings/bdo-data-extractor/src/urn"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[string]("time")
}

func main() {
	err := config.Load()
	if err != nil {
		log.Print("Failed to load config: ", err)
	}
	// Global is bound as a Wails service and the setup wizard writes to it, so it
	// must be non-nil even on a fresh install (Load leaves it nil when no file exists).
	if config.Global == nil {
		config.Global = &config.Config{}
	}

	setupService := setup.New()

	catalogService, err := catalog.New()
	if err != nil {
		log.Fatal("Failed to load catalog..: ", err)
	}

	// The dataset isn't loaded here — the frontend owns that: it checks setup status,
	// runs the wizard if needed, then awaits LoadData() behind its load screen. That
	// keeps a single owner for the load and lets the window open immediately.

	// market service is shared between the resolver's price closure and the bound service.
	marketService := market.New()

	resolver := recipe.NewResolver(
		12,
		func(recipeType string) float64 {
			if catalog.Mastery == nil {
				return 1
			}
			return catalog.Mastery.YieldMultiplierFor(recipeType)
		},
		func(u urn.URN) (int64, bool) {
			if e, ok := marketService.Price(u); ok {
				return e.Price, true
			}
			return 0, false
		},
	)

	app := application.New(
		application.Options{
			Name:        "bdo-viewer",
			Description: "BDO Companion App",
			Services: []application.Service{
				application.NewService(config.Global),
				application.NewService(setupService),
				application.NewService(updates.New()),
				application.NewServiceWithOptions(catalogService, application.ServiceOptions{Route: "/icons"}),
				application.NewService(resolver),
				application.NewService(sources.Registry),
				application.NewService(marketService),
				application.NewService(gear.NewBuilderService()),
			},
			Assets: application.AssetOptions{
				Handler: application.AssetFileServerFS(assets),
			},
			Mac: application.MacOptions{
				ApplicationShouldTerminateAfterLastWindowClosed: true,
			},
		},
	)

	// Point the updater at GitHub releases (no-op for dev builds).
	if err := updates.Configure(app); err != nil {
		log.Print("Failed to configure updater: ", err)
	}

	windowConf := config.GetWindowOrDefault(100, 100, 1200, 800)

	window := app.Window.NewWithOptions(
		application.WebviewWindowOptions{
			Title: "BDO Viewer",
			Mac: application.MacWindow{
				InvisibleTitleBarHeight: 50,
				Backdrop:                application.MacBackdropTranslucent,
				TitleBar:                application.MacTitleBarHiddenInset,
			},
			BackgroundColour:       application.NewRGB(27, 38, 54),
			URL:                    "/",
			InitialPosition:        application.WindowXY,
			MinWidth:               300,
			MinHeight:              300,
			X:                      windowConf.X,
			Y:                      windowConf.Y,
			Width:                  windowConf.Width,
			Height:                 windowConf.Height,
			OpenInspectorOnStartup: true,
		},
	)

	go func() {

		didFirstTimeWindowCheck := false
		var prevX, prevY, prevW, prevH int
		for {
			if window == nil {
				time.Sleep(time.Second)
				continue
			}

			if !window.IsVisible() || window.IsMinimised() {
				time.Sleep(time.Second)
				continue
			}

			if !didFirstTimeWindowCheck {
				if s, err := window.GetScreen(); err == nil {
					// Ensure the saved pos & size aren't off-screen.
					// (there's a weird bug that causes window pos to get saved to something crazy, and size as 0)

					wpX, wpY := window.Position()
					wsX, wsY := window.Size()
					wCenterX, wCenterY := wpX+(wsX/2), wpY+(wsY/2)

					b := s.WorkArea
					if !b.Contains(application.Point{X: wCenterX, Y: wCenterY}) {
						window.Center()
					}

					didFirstTimeWindowCheck = true
				}
			}

			hasChanges := false
			x, y := window.Position()
			if x != prevX || y != prevY {
				prevX, prevY = x, y
				hasChanges = true
			}

			w, h := window.Size()
			if w != prevW || h != prevH {
				prevW, prevH = w, h
				hasChanges = true
			}

			if hasChanges {
				config.Update(
					func(c *config.Config) {
						if c.Window == nil {
							c.Window = &config.WindowState{}
						}

						c.Window.X = x
						c.Window.Y = y
						c.Window.Width = w
						c.Window.Height = h
					},
				)
			}

			time.Sleep(time.Second)
		}
	}()

	// Run the application. This blocks until the application has been exited.
	err = app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
