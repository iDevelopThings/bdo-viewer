package config

type WindowState struct {
	Width  int `json:"width"`
	Height int `json:"height"`
	X      int `json:"x"`
	Y      int `json:"y"`
}

func GetWindowOrDefault(x, y, w, h int) WindowState {
	if Global == nil || Global.Window == nil {
		return WindowState{X: x, Y: y, Width: w, Height: h}
	}

	/*app := application.Get()
	wRect := application.Rect{
		X:      Global.Window.X,
		Y:      Global.Window.Y,
		Width:  Global.Window.Width,
		Height: Global.Window.Height,
	}



	for i, screen := range app.Screen.GetAll() {
		// We want to ensure it's within the bounds of the screen.
		if !screen.Bounds.Contains(wRect.Origin()) && screen.Bounds.Contains(application.Point{X: wRect.X + wRect.Width, Y: wRect.Y + wRect.Height}) {
			return *Global.Window
		}
		// If the window is not within the bounds of the screen, we can check if it's within the bounds of the screen's work area.
		if screen.WorkArea.Contains(wRect) {
			return *Global.Window
		}

	}*/

	return *Global.Window
}
