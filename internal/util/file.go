package util

import (
	"bufio"
	"encoding/json"
	"os"
)

func ReadJSON(path string, v any) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	return json.NewDecoder(bufio.NewReaderSize(f, 1<<20)).Decode(v)
}
