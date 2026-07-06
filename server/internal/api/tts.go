package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"still/server/internal/gemini"
)

// ttsCacheCap bounds the number of synthesized WAV clips kept in memory.
const ttsCacheCap = 64

// tts synthesizes spoken audio for a journal entry and streams it back as a WAV
// file. It is protected by the auth middleware like every other /api route.
//
//	GET /api/tts?entryId={id}&voice={optional}
func (a *API) tts(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}

	entryID := r.URL.Query().Get("entryId")
	if strings.TrimSpace(entryID) == "" {
		writeError(w, http.StatusBadRequest, "entryId is required")
		return
	}
	voice := r.URL.Query().Get("voice")

	e, found, err := a.store.GetEntry(r.Context(), uid, entryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get entry")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}

	// Prefer typed text; fall back to the transcript of a voice note.
	text := e.Text
	if strings.TrimSpace(text) == "" {
		text = e.Transcript
	}
	if strings.TrimSpace(text) == "" {
		writeError(w, http.StatusBadRequest, "nothing to read")
		return
	}

	// When Storage is configured, generate the audio once per text version and
	// reuse it. Otherwise fall back to the in-memory cache + on-demand path.
	if a.blobs != nil {
		a.ttsFromStorage(w, r, uid, entryID, text, voice)
		return
	}

	if a.gemini == nil || !a.gemini.Configured() {
		writeError(w, http.StatusServiceUnavailable, "text-to-speech is not configured")
		return
	}

	// Serve from cache when we already synthesized this exact text/voice.
	// UpdatedAt in the key invalidates the cache when the entry is edited.
	key := ttsCacheKey(uid, entryID, e.UpdatedAt, voice)
	wav, cached := a.ttsCache.get(key)
	if !cached {
		wav, _, err = a.gemini.Synthesize(r.Context(), text, voice)
		if err != nil {
			if errors.Is(err, gemini.ErrNotConfigured) {
				writeError(w, http.StatusServiceUnavailable, "text-to-speech is not configured")
				return
			}
			log.Printf("tts: synthesize failed: %v", err)
			writeError(w, http.StatusBadGateway, "text-to-speech failed")
			return
		}
		a.ttsCache.put(key, wav)
	}

	writeAudio(w, r, wav)
}

// ttsFromStorage serves TTS audio persisted in Cloud Storage, synthesizing and
// storing it once per text version. The object path embeds a hash of the text
// so an edit produces a new object (old versions simply linger unreferenced).
func (a *API) ttsFromStorage(w http.ResponseWriter, r *http.Request, uid, entryID, text, voice string) {
	sum := sha256.Sum256([]byte(text))
	key := hex.EncodeToString(sum[:])[:16]
	objectPath := fmt.Sprintf("tts/%s/%s-%s.wav", uid, entryID, key)

	wav, _, found, err := a.blobs.Get(r.Context(), objectPath)
	if err != nil {
		log.Printf("tts: storage get %s failed: %v", objectPath, err)
		writeError(w, http.StatusInternalServerError, "failed to load audio")
		return
	}
	if !found {
		if a.gemini == nil || !a.gemini.Configured() {
			writeError(w, http.StatusServiceUnavailable, "text-to-speech is not configured")
			return
		}
		wav, _, err = a.gemini.Synthesize(r.Context(), text, voice)
		if err != nil {
			if errors.Is(err, gemini.ErrNotConfigured) {
				writeError(w, http.StatusServiceUnavailable, "text-to-speech is not configured")
				return
			}
			log.Printf("tts: synthesize failed: %v", err)
			writeError(w, http.StatusBadGateway, "text-to-speech failed")
			return
		}
		if perr := a.blobs.Put(r.Context(), objectPath, "audio/wav", wav); perr != nil {
			log.Printf("tts: persist %s failed: %v", objectPath, perr)
		}
	}

	writeAudio(w, r, wav)
}

// writeAudio streams wav as an audio/wav response. http.ServeContent sets
// Content-Length and Accept-Ranges and honors a Range request (responding 206)
// when the client sends one, so a mobile player can stream this URL directly.
func writeAudio(w http.ResponseWriter, r *http.Request, wav []byte) {
	writeStoredAudio(w, r, "audio/wav", wav)
}

// writeStoredAudio streams audio with an explicit content type. Like writeAudio
// it relies on http.ServeContent for Content-Length, Accept-Ranges and Range
// (206) handling so a mobile player can stream the URL directly.
func writeStoredAudio(w http.ResponseWriter, r *http.Request, contentType string, data []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeContent(w, r, "audio", time.Time{}, bytes.NewReader(data))
}

// ttsCacheKey identifies a cached clip by user, entry, entry revision and voice.
func ttsCacheKey(uid, entryID, updatedAt, voice string) string {
	return strings.Join([]string{uid, entryID, updatedAt, voice}, "\x00")
}

// ttsCache is a tiny, concurrency-safe in-process cache of synthesized WAV audio
// so repeated plays of the same entry do not re-call Gemini. When it reaches its
// cap it evicts an arbitrary entry before inserting a new one, which keeps memory
// bounded without tracking access order.
type ttsCache struct {
	mu    sync.RWMutex
	cap   int
	items map[string][]byte
}

func newTTSCache(capacity int) *ttsCache {
	if capacity <= 0 {
		capacity = ttsCacheCap
	}
	return &ttsCache{cap: capacity, items: make(map[string][]byte, capacity)}
}

func (c *ttsCache) get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	wav, ok := c.items[key]
	return wav, ok
}

func (c *ttsCache) put(key string, wav []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.items[key]; !exists && len(c.items) >= c.cap {
		for k := range c.items { // evict an arbitrary entry
			delete(c.items, k)
			break
		}
	}
	c.items[key] = wav
}
