package config

type PlayerInfo struct {
	CookingMastery    int `json:"cooking_mastery"`
	AlchemyMastery    int `json:"alchemy_mastery"`
	ProcessingMastery int `json:"processing_mastery"`
}

func GetPlayerInfo() PlayerInfo {
	if Global == nil || Global.Player == nil {
		return PlayerInfo{}
	}

	return *Global.Player
}

// GetPlayer returns the player settings (life-skill mastery), bound for the
// frontend settings panel.
func (c *Config) GetPlayer() PlayerInfo {
	if c == nil || c.Player == nil {
		return PlayerInfo{}
	}
	return *c.Player
}

// SetPlayerMastery updates the global life-skill mastery and persists it.
// Negative values clamp to 0.
func (c *Config) SetPlayerMastery(cooking, alchemy, processing int) error {
	if c.Player == nil {
		c.Player = &PlayerInfo{}
	}
	c.Player.CookingMastery = max(0, cooking)
	c.Player.AlchemyMastery = max(0, alchemy)
	c.Player.ProcessingMastery = max(0, processing)

	return SaveIfChanged()
}
