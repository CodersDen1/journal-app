package api

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

// maxRecordingBytes caps the size of an uploaded voice recording (~25MB),
// matching the blob store's read cap.
const maxRecordingBytes = 25 << 20

// recordingMimeForExt maps a lowercased file extension to an audio MIME type
// for stored recordings, defaulting to audio/mp4.
var recordingMimeForExt = map[string]string{
	".m4a": "audio/mp4",
	".mp4": "audio/mp4",
	".mp3": "audio/mp3",
	".wav": "audio/wav",
	".aac": "audio/aac",
	".caf": "audio/x-caf",
}

// recordingMime infers the stored content type from a filename's extension.
func recordingMime(name string) string {
	if mime, ok := recordingMimeForExt[strings.ToLower(filepath.Ext(name))]; ok {
		return mime
	}
	return "audio/mp4"
}

// recordingPath is the single fixed object holding a user's recording for an
// entry. It is keyed by path (the Firestore entry need not exist).
func recordingPath(uid, entryID string) string {
	return fmt.Sprintf("recordings/%s/%s", uid, entryID)
}

// putRecording stores a voice recording in Cloud Storage for an entry.
//
//	POST /api/journals/{id}/recording   (multipart/form-data, field "audio")
func (a *API) putRecording(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if a.blobs == nil {
		writeError(w, http.StatusServiceUnavailable, "storage is not configured")
		return
	}

	// Cap the in-memory portion of the multipart parse.
	if err := r.ParseMultipartForm(maxRecordingBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing audio file field")
		return
	}
	defer file.Close()

	if header.Size > maxRecordingBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "audio file too large")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxRecordingBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read audio file")
		return
	}
	if len(data) > maxRecordingBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "audio file too large")
		return
	}

	path := recordingPath(uid, r.PathValue("id"))
	if err := a.blobs.Put(r.Context(), path, recordingMime(header.Filename), data); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store recording")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// getRecording streams a previously stored recording for an entry.
//
//	GET /api/journals/{id}/recording
func (a *API) getRecording(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if a.blobs == nil {
		writeError(w, http.StatusNotFound, "recording not found")
		return
	}

	path := recordingPath(uid, r.PathValue("id"))
	data, contentType, found, err := a.blobs.Get(r.Context(), path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load recording")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "recording not found")
		return
	}
	if contentType == "" {
		contentType = "audio/mp4"
	}
	writeStoredAudio(w, r, contentType, data)
}
