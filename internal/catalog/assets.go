package catalog

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"bdo-viewer/internal/config"
)

// redirectCache serves a generic path-alias table (asset_redirects.json): a request
// for one served path is transparently served from another file under the data dir.
// Item and knowledge icons use it to share one decoded file across the many ids that
// reference it, but the mechanism is content-agnostic — any asset can add aliases.
// The parsed table is cached and only re-read when the file's mtime (or the data
// dir) changes, so ordinary requests never re-parse it.
type redirectCache struct {
	mu    sync.RWMutex
	dir   string
	mtime time.Time
	table map[string]string
}

var redirects redirectCache

// redirectFile is the merged alias table the extractor writes at the data-dir root.
// Its keys/targets are relative to the data dir, so the handler applies them to any
// request (item icons, knowledge icons, …).
func redirectFile(dataDir string) string {
	return filepath.Join(dataDir, "asset_redirects.json")
}

// key normalizes a request URL path to a data-dir-relative table key.
func key(urlPath string) string {
	return strings.TrimPrefix(path.Clean(urlPath), "/")
}

// lookup returns the aliased target (relative to dataDir) for a request path,
// reloading the table only when redirects.json has changed.
func (rc *redirectCache) lookup(dataDir, urlPath string) (string, bool) {
	fi, err := os.Stat(redirectFile(dataDir))
	if err != nil {
		return "", false // no alias table — serve directly
	}

	rc.mu.RLock()
	fresh := rc.table != nil && rc.dir == dataDir && fi.ModTime().Equal(rc.mtime)
	if fresh {
		target, ok := rc.table[key(urlPath)]
		rc.mu.RUnlock()
		return target, ok
	}
	rc.mu.RUnlock()

	rc.mu.Lock()
	defer rc.mu.Unlock()
	// Re-check under the write lock: another goroutine may have just reloaded.
	if rc.table == nil || rc.dir != dataDir || !fi.ModTime().Equal(rc.mtime) {
		data, err := os.ReadFile(redirectFile(dataDir))
		if err != nil {
			return "", false
		}
		table := map[string]string{}
		if err := json.Unmarshal(data, &table); err != nil {
			return "", false
		}
		rc.table, rc.dir, rc.mtime = table, dataDir, fi.ModTime()
	}
	target, ok := rc.table[key(urlPath)]
	return target, ok
}

// ServeHTTP serves the catalog's data directory (icons/, knowledge_icons/, ...)
// as static files. Registered with a Route via application.ServiceOptions in
// main.go - the asset server strips that prefix before calling in, so e.g.
// Route "/icons" turns a request for "/icons/icons/123.png" into "/icons/123.png"
// here, which resolves against the data dir. Requests matching an alias in
// redirects.json are served from the shared target instead.
func (c *Catalog) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	dataDir := config.GetExtractedDataDir()
	if target, ok := redirects.lookup(dataDir, r.URL.Path); ok {
		http.ServeFile(w, r, filepath.Join(dataDir, filepath.FromSlash(target)))
		return
	}
	http.FileServer(http.Dir(dataDir)).ServeHTTP(w, r)
}
