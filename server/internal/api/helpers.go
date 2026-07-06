package api

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

// mimeForFilename infers an audio MIME type from a filename's extension,
// defaulting to audio/mp4 for unknown or missing extensions.
func mimeForFilename(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if mime, ok := mimeForExt[ext]; ok {
		return mime
	}
	return "audio/mp4"
}

// readLimited reads up to maxAudioBytes from r. If the stream exceeds the
// limit, it writes a 413 error and returns a non-nil error so the caller stops.
func readLimited(w http.ResponseWriter, r io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, maxAudioBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read audio file")
		return nil, err
	}
	if len(data) > maxAudioBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "audio file too large")
		return nil, io.ErrShortBuffer
	}
	return data, nil
}
