module bdo-viewer

go 1.26.0

require (
	github.com/dgravesa/go-parallel v0.6.0
	github.com/goccy/go-json v0.10.6
	github.com/idevelopthings/bdo-data-extractor v0.1.7
	github.com/pkg/errors v0.9.1
	github.com/tidwall/gjson v1.19.0
	github.com/tidwall/sjson v1.2.5
	github.com/wailsapp/wails/v3 v3.0.0-alpha2.117
)

replace github.com/idevelopthings/bdo-data-extractor => ..\bdoextract

require (
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/coder/websocket v1.8.15 // indirect
	github.com/deepteams/webp v1.2.7 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
	github.com/klauspost/compress v1.19.0 // indirect
	github.com/mattn/go-colorable v0.1.15 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.0 // indirect
	github.com/wI2L/jettison v0.7.4 // indirect
	golang.org/x/mod v0.38.0 // indirect
	golang.org/x/sys v0.46.0 // indirect
)
