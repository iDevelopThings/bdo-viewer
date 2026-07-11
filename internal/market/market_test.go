package market

import "testing"

func TestParsePayloadKeepsBaseRows(t *testing.T) {
	body := []byte(`{
		"data": [
			{"item_id": 5960, "sub_id": 0, "enhancement_level": 0, "price": 12000, "total_trades": 42, "in_stock": 7},
			{"item_id": 10001, "sub_id": 0, "enhancement_level": 3, "price": 999999, "total_trades": 1, "in_stock": 1},
			{"item_id": 10002, "sub_id": 2, "enhancement_level": 0, "price": 888888, "total_trades": 2, "in_stock": 2},
			{"item_id": 672, "sub_id": 0, "enhancement_level": 0, "price": 5300, "total_trades": 900, "in_stock": 120}
		]
	}`)

	byID, err := parsePayload(body)
	if err != nil {
		t.Fatalf("parsePayload: %v", err)
	}

	if len(byID) != 2 {
		t.Fatalf("kept %d rows, want 2 (base rows only)", len(byID))
	}
	if e := byID[5960]; e.Price != 12000 || e.Trades != 42 || e.Stock != 7 {
		t.Errorf("item 5960 = %+v, want price 12000 trades 42 stock 7", e)
	}
	if _, ok := byID[10001]; ok {
		t.Error("enhanced row (enhancement_level 3) should be dropped")
	}
	if _, ok := byID[10002]; ok {
		t.Error("variant row (sub_id 2) should be dropped")
	}
}
