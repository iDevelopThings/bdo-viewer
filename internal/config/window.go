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

	return *Global.Window
}
