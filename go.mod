module bdo-viewer

go 1.26.0

require (
	github.com/idevelopthings/bdo-data-extractor v0.0.0
	github.com/pkg/errors v0.9.1
	github.com/wailsapp/wails/v3 v3.0.0-alpha2.111
)

replace github.com/idevelopthings/bdo-data-extractor => ..\bdoextract

require (
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/coder/websocket v1.8.15 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
	github.com/mattn/go-colorable v0.1.15 // indirect
	github.com/mattn/go-isatty v0.0.22 // indirect
	github.com/wailsapp/wails/webview2 v1.0.27 // indirect
	golang.org/x/mod v0.35.0 // indirect
	golang.org/x/sys v0.46.0 // indirect
)
