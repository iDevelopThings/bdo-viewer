package updates

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// TestGitHubProviderFlow exercises the stock github provider against a mock GitHub
// releases API using our production Config (Repo + checksums.txt sidecar). It
// proves the parts we configure — release discovery, Windows asset matching,
// checksum sidecar parsing, and digest verification — without publishing anything.
// The framework owns the swap/restart from here.
func TestGitHubProviderFlow(t *testing.T) {
	const assetName = "bdo-viewer-windows-amd64.exe"
	payload := []byte("pretend this is the v0.0.2 binary")
	sum := sha256.Sum256(payload)
	checksums := fmt.Sprintf("%s  %s\n", hex.EncodeToString(sum[:]), assetName)

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/"+Repo+"/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		base := "http://" + r.Host
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": "v0.0.2",
			"name":     "0.0.2",
			"body":     "release notes",
			"assets": []map[string]any{
				{"id": 1, "name": assetName, "content_type": "application/octet-stream", "size": len(payload), "browser_download_url": base + "/dl/exe"},
				{"id": 2, "name": "checksums.txt", "content_type": "text/plain", "size": len(checksums), "browser_download_url": base + "/dl/checksums"},
			},
		})
	})
	mux.HandleFunc("/dl/exe", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(payload) })
	mux.HandleFunc("/dl/checksums", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(checksums)) })
	srv := httptest.NewServer(mux)
	defer srv.Close()

	gh, err := github.New(github.Config{
		Repository:    Repo,
		ChecksumAsset: "checksums.txt",
		BaseURL:       srv.URL,
	})
	if err != nil {
		t.Fatalf("github.New: %v", err)
	}

	ctx := context.Background()
	rel, err := gh.Check(ctx, updater.CheckRequest{CurrentVersion: "0.0.1", Platform: "windows", Arch: "amd64"})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if rel == nil {
		t.Fatal("Check returned no release for an older CurrentVersion")
	}
	if rel.Version != "0.0.2" {
		t.Fatalf("release version = %q, want 0.0.2", rel.Version)
	}
	if rel.Artifact.Filename != assetName {
		t.Fatalf("matched asset = %q, want %q", rel.Artifact.Filename, assetName)
	}
	if rel.Verification == nil || !bytes.Equal(rel.Verification.Digest, sum[:]) {
		t.Fatal("checksum sidecar digest not attached / mismatched")
	}

	var got bytes.Buffer
	if err := gh.Download(ctx, rel, &got, func(int64, int64) {}); err != nil {
		t.Fatalf("Download: %v", err)
	}
	if !bytes.Equal(got.Bytes(), payload) {
		t.Fatal("downloaded bytes differ from the served artifact")
	}
	if dl := sha256.Sum256(got.Bytes()); !bytes.Equal(dl[:], rel.Verification.Digest) {
		t.Fatal("downloaded artifact does not match its published checksum")
	}
}

// TestCheckUpToDate confirms the provider reports no update when the running
// version already matches the latest release.
func TestCheckUpToDate(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/"+Repo+"/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"tag_name": "v1.0.0", "name": "1.0.0"})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	gh, err := github.New(github.Config{Repository: Repo, BaseURL: srv.URL})
	if err != nil {
		t.Fatalf("github.New: %v", err)
	}
	rel, err := gh.Check(context.Background(), updater.CheckRequest{CurrentVersion: "1.0.0", Platform: "windows", Arch: "amd64"})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if rel != nil {
		t.Fatalf("expected no update at the latest version, got %q", rel.Version)
	}
}
