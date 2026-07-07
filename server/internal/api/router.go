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
// Routes fall into three tiers:
//   - Public (no auth): GET /api/health and POST /api/revenuecat/webhook (the
//     webhook authenticates with its own shared-secret header).
//   - Authenticated only: /api/me and the /api/entitlement endpoints — reachable
//     without a subscription so the client can identify the user and learn
//     whether to show the paywall.
//   - Authenticated + entitled: every data/feature route, each wrapped with
//     requireEntitlement so an un-subscribed (or tampered) client gets 402.
//
// A nil blobs disables Storage-backed persistence (TTS falls back to on-demand
// generation and the recording endpoints report unavailable).
func NewRouter(s store.Store, g *gemini.Client, blobs *blob.Store, verifier auth.Verifier, authMode string, ent Entitler, webhookAuth, entitlementID string) http.Handler {
	a := New(s, g, blobs, ent, webhookAuth, entitlementID)

	protected := http.NewServeMux()
	// Reachable without an active subscription.
	protected.HandleFunc("GET /api/me", a.me)
	protected.HandleFunc("GET /api/entitlement", a.getEntitlement)
	protected.HandleFunc("POST /api/entitlement/refresh", a.refreshEntitlement)

	// Gated: require an active entitlement.
	gate := a.requireEntitlement
	protected.HandleFunc("GET /api/journals", gate(a.listJournals))
	protected.HandleFunc("POST /api/journals", gate(a.createJournal))
	protected.HandleFunc("GET /api/journals/{id}", gate(a.getJournal))
	protected.HandleFunc("PUT /api/journals/{id}", gate(a.updateJournal))
	protected.HandleFunc("DELETE /api/journals/{id}", gate(a.deleteJournal))

	protected.HandleFunc("GET /api/insights", gate(a.getInsights))
	protected.HandleFunc("POST /api/insights/generate", gate(a.generateInsights))

	protected.HandleFunc("GET /api/profile", gate(a.getProfile))
	protected.HandleFunc("PUT /api/profile", gate(a.updateProfile))

	protected.HandleFunc("POST /api/transcribe", gate(a.transcribe))
	protected.HandleFunc("GET /api/tts", gate(a.tts))

	protected.HandleFunc("POST /api/journals/{id}/recording", gate(a.putRecording))
	protected.HandleFunc("GET /api/journals/{id}/recording", gate(a.getRecording))

	authed := auth.Middleware(verifier, authMode)(protected)

	root := http.NewServeMux()
	root.HandleFunc("GET /api/health", a.health)
	root.HandleFunc("POST /api/revenuecat/webhook", a.revenueCatWebhook) // authed by shared secret
	root.Handle("/", authed)                                            // everything else goes through auth

	return root
}
