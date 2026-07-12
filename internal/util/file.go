package util

import (
	"fmt"
	"os"
	"time"

	"github.com/goccy/go-json"

	"github.com/idevelopthings/bdo-data-extractor/src/utils"
)

var jsonLoadTimes = map[string]time.Duration{}

const jsonDebugTimes = false

func DumpJSONLoadTimes() {
	if len(jsonLoadTimes) == 0 {
		return
	}

	total := time.Duration(0)
	fmt.Println("JSON load times:")
	for path, dur := range jsonLoadTimes {
		fmt.Printf("\t%s: %s\n", path, dur)
		total += dur
	}
	fmt.Printf("\tTOTAL: %s\n", total)
	jsonLoadTimes = map[string]time.Duration{}
}

func ReadJSON(path string, v any) error {
	var timed func()
	if jsonDebugTimes {
		timed = utils.TimedTrack(
			fmt.Sprintf("ReadJSON: %s", path),
			func(t *utils.TimeTrack) {
				jsonLoadTimes[path] = t.Duration()
			},
		)
	} else {
		timed = func() {}
	}
	defer timed()

	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, v)
}
