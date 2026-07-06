package api

import (
	"net/http"

	"still/server/internal/auth"
	"still/server/internal/blob"
	"still/server/internal/gemini"
	"still/server/internal/store"
)

// NewRouter builds the application's HTTP handler.
//
// GET /api/health is registered on the outer mux and requires no auth. Every
// other /api/* route is registered on an inner mux that is wrapped with the
// auth middleware, so all of them require a valid identity. A nil blobs
// disables Storage-backed persistence (TTS falls back to on-demand generation
// and the recording endpoints report unavailable).
func NewRouter(s store.Store, g *gemini.Client, blobs *blob.Store, verifier auth.Verifier, authMode string) http.Handler {
	a := New(s, g, blobs)

	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/me", a.me)

	protected.HandleFunc("GET /api/journals", a.listJournals)
	protected.HandleFunc("POST /api/journals", a.createJournal)
	protected.HandleFunc("GET /api/journals/{id}", a.getJournal)
	protected.HandleFunc("PUT /api/journals/{id}", a.updateJournal)
	protected.HandleFunc("DELETE /api/journals/{id}", a.deleteJournal)

	protected.HandleFunc("GET /api/insights", a.getInsights)
	protected.HandleFunc("POST /api/insights/generate", a.generateInsights)

	protected.HandleFunc("GET /api/profile", a.getProfile)
	protected.HandleFunc("PUT /api/profile", a.updateProfile)

	protected.HandleFunc("POST /api/transcribe", a.transcribe)
	protected.HandleFunc("GET /api/tts", a.tts)

	protected.HandleFunc("POST /api/journals/{id}/recording", a.putRecording)
	protected.HandleFunc("GET /api/journals/{id}/recording", a.getRecording)

	authed := auth.Middleware(verifier, authMode)(protected)

	root := http.NewServeMux()
	root.HandleFunc("GET /api/health", a.health)
	root.Handle("/", authed) // everything else goes through auth

	return root
}
