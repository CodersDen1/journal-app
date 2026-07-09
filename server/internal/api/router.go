package api

import (
	"net/http"

	"still/server/internal/auth"
	"still/server/internal/blob"
	"still/server/internal/gemini"
	"still/server/internal/store"
	"still/server/internal/stripe"
)

// NewRouter builds the application's HTTP handler.
//
// Routes fall into four tiers:
//   - Public (no auth): GET /api/health, POST /api/stripe/webhook (verified by
//     its Stripe signature), and the GET /billing return pages Checkout redirects
//     to.
//   - Authenticated only: /api/me, the /api/entitlement endpoints, and the
//     /api/billing checkout/portal endpoints — reachable without a subscription
//     so the client can identify the user, learn whether to show the paywall, and
//     start a subscription.
//   - Authenticated + entitled: every data/feature route, each wrapped with
//     requireEntitlement so an un-subscribed (or tampered) client gets 402.
//
// billing carries the Stripe redirect URLs and plan price ids; empty URL fields
// are derived from the incoming request host. A nil blobs disables Storage-backed
// persistence.
func NewRouter(s store.Store, g *gemini.Client, blobs *blob.Store, verifier auth.Verifier, authMode string, ent Entitler, sc *stripe.Client, billing BillingConfig) http.Handler {
	a := New(s, g, blobs, ent, sc, billing)

	protected := http.NewServeMux()
	// Reachable without an active subscription.
	protected.HandleFunc("GET /api/me", a.me)
	protected.HandleFunc("GET /api/entitlement", a.getEntitlement)
	protected.HandleFunc("POST /api/entitlement/refresh", a.refreshEntitlement)
	protected.HandleFunc("GET /api/billing/plans", a.getPlans)
	protected.HandleFunc("POST /api/billing/checkout", a.createCheckout)
	protected.HandleFunc("POST /api/billing/portal", a.createPortal)

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
	root.HandleFunc("POST /api/stripe/webhook", a.stripeWebhook) // authed by Stripe signature
	root.HandleFunc("GET /billing/success", a.billingSuccess)
	root.HandleFunc("GET /billing/cancel", a.billingCancel)
	root.Handle("/", authed) // everything else goes through auth

	return root
}
