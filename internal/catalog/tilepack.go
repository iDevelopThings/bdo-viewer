package catalog

import (
	"encoding/binary"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The extractor packs each world-map layer's pyramid into one tiles.pack instead of tens
// of thousands of files (see the extractor's tilepack.go). This reader serves tiles out of
// it by (z,x,y): the index is loaded once and reused until the file changes. Layout:
//
//	magic  "BDOTILE1"
//	blobs  concatenated webp tiles
//	index  count uint32, then count × { z uint8; x,y int32; off uint64; len uint32 }
//	footer uint64 = absolute offset of the index (final 8 bytes), all little-endian.
const tilePackMagic = "BDOTILE1"

type tileKey struct{ z, x, y int }

type tileLoc struct {
	off    int64
	length int
}

// tilePack is one loaded tiles.pack: the open handle plus its (z,x,y)→location index,
// valid while the file's mtime is unchanged.
type tilePack struct {
	mtime time.Time
	f     *os.File
	index map[tileKey]tileLoc
}

// packCache serves world-map tiles out of per-layer packs, loading each pack's index
// once and reloading only when the file changes (a re-extraction).
type packCache struct {
	mu    sync.Mutex
	packs map[string]*tilePack
	// suspended blocks opening packs while an extraction replaces the files.
	suspended bool
}

var worldPacks = packCache{packs: map[string]*tilePack{}}

// SuspendAssets closes every open world-map pack and refuses to reopen them until
// ResumeAssets. An extraction rewrites worldmap/ in place, and Windows will not
// unlink a file another handle still holds — serving tiles straight out of an open
// pack is exactly such a handle. Blocking reopens (rather than only closing) keeps
// an in-flight tile request from re-acquiring one between the close and the wipe.
// Tiles 404 while suspended.
func SuspendAssets() {
	worldPacks.mu.Lock()
	defer worldPacks.mu.Unlock()
	worldPacks.suspended = true
	for path, p := range worldPacks.packs {
		_ = p.f.Close()
		delete(worldPacks.packs, path)
	}
}

// ResumeAssets lets tile requests open the packs again once an extraction has
// finished. The next request loads the freshly written pack.
func ResumeAssets() {
	worldPacks.mu.Lock()
	defer worldPacks.mu.Unlock()
	worldPacks.suspended = false
}

// serveTile writes the (z,x,y) tile from the layer's pack, or reports false if the pack
// or that tile is missing, so the caller can fall through to a 404.
func (c *packCache) serveTile(w http.ResponseWriter, packPath string, z, x, y int) bool {
	p, err := c.get(packPath)
	if err != nil {
		return false
	}
	loc, ok := p.index[tileKey{z, x, y}]
	if !ok {
		return false
	}
	buf := make([]byte, loc.length)
	if _, err := p.f.ReadAt(buf, loc.off); err != nil {
		return false
	}
	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(buf)
	return true
}

func (c *packCache) get(path string) (*tilePack, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.suspended {
		return nil, os.ErrClosed
	}
	fi, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if p := c.packs[path]; p != nil && p.mtime.Equal(fi.ModTime()) {
		return p, nil
	}
	p, err := loadTilePack(path, fi.ModTime())
	if err != nil {
		return nil, err
	}
	if old := c.packs[path]; old != nil {
		_ = old.f.Close()
	}
	c.packs[path] = p
	return p, nil
}

func loadTilePack(path string, mtime time.Time) (*tilePack, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	fi, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	size := fi.Size()

	var head [8]byte
	if _, err := f.ReadAt(head[:], 0); err != nil || string(head[:]) != tilePackMagic {
		_ = f.Close()
		return nil, os.ErrInvalid
	}
	var foot [8]byte
	if _, err := f.ReadAt(foot[:], size-8); err != nil {
		_ = f.Close()
		return nil, err
	}
	indexOff := int64(binary.LittleEndian.Uint64(foot[:]))
	if indexOff < 8 || indexOff > size-12 {
		_ = f.Close()
		return nil, os.ErrInvalid
	}
	idx := make([]byte, size-8-indexOff)
	if _, err := f.ReadAt(idx, indexOff); err != nil {
		_ = f.Close()
		return nil, err
	}

	count := int(binary.LittleEndian.Uint32(idx[:4]))
	index := make(map[tileKey]tileLoc, count)
	for i, p := 0, 4; i < count && p+21 <= len(idx); i, p = i+1, p+21 {
		e := idx[p : p+21]
		index[tileKey{
			z: int(e[0]),
			x: int(int32(binary.LittleEndian.Uint32(e[1:5]))),
			y: int(int32(binary.LittleEndian.Uint32(e[5:9]))),
		}] = tileLoc{
			off:    int64(binary.LittleEndian.Uint64(e[9:17])),
			length: int(binary.LittleEndian.Uint32(e[17:21])),
		}
	}
	return &tilePack{mtime: mtime, f: f, index: index}, nil
}

// parseWorldmapTile matches "worldmap/<layer>/<z>/<x>/<y>.webp" (leading slash optional),
// the path the viewer's TileLayer requests. Coords may be negative.
func parseWorldmapTile(urlPath string) (layer string, z, x, y int, ok bool) {
	s := strings.TrimPrefix(urlPath, "/")
	if !strings.HasPrefix(s, "worldmap/") || !strings.HasSuffix(s, ".webp") {
		return "", 0, 0, 0, false
	}
	parts := strings.Split(strings.TrimSuffix(s, ".webp"), "/")
	if len(parts) != 5 {
		return "", 0, 0, 0, false
	}
	z, e1 := strconv.Atoi(parts[2])
	x, e2 := strconv.Atoi(parts[3])
	y, e3 := strconv.Atoi(parts[4])
	if e1 != nil || e2 != nil || e3 != nil {
		return "", 0, 0, 0, false
	}
	return parts[1], z, x, y, true
}
