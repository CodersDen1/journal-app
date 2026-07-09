// Command server runs the Still journaling app's HTTP backend.
//
// It authenticates mobile clients with Firebase ID tokens, stores per-user data
// in Firestore (or an in-memory store for local development), and transcribes
// voice notes server-side via the Gemini API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"still/server/internal/api"
	"still/server/internal/auth"
	"still/server/internal/blob"
	"still/server/internal/config"
	"still/server/internal/entitlements"
	"still/server/internal/firebaseapp"
	"still/server/internal/gemini"
	"still/server/internal/store"
	"still/server/internal/stripe"
)

func main() {
	cfg := config.Load()
	cfg.LogEffective()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Initialize Firebase only when the auth or store backend needs it.
	var (
		fbApp    *firebaseapp.App
		verifier auth.Verifier
		st       store.Store
		err      error
	)

	if cfg.NeedsFirebase() {
		fbApp, err = firebaseapp.New(ctx, cfg)
		if err != nil {
			log.Fatalf("firebase init failed: %v", err)
		}
	}

	if cfg.AuthMode == config.AuthModeFirebase {
		authClient, aerr := fbApp.Auth(ctx)
		if aerr != nil {
			log.Fatalf("firebase auth init failed: %v", aerr)
		}
		verifier = authClient
	}

	switch cfg.Store {
	case config.StoreFirestore:
		fsClient, ferr := fbApp.Firestore(ctx)
		if ferr != nil {
			log.Fatalf("firestore init failed: %v", ferr)
		}
		st = store.NewFirestoreStore(fsClient)
	default:
		st = store.NewMemoryStore()
	}
	defer func() {
		if cerr := st.Close(); cerr != nil {
			log.Printf("store close error: %v", cerr)
		}
	}()

	geminiClient := gemini.New(cfg.GeminiAPIKey, cfg.GeminiModel, cfg.GeminiTTSModel)

	// Build the optional blob store from Cloud Storage. When storage is
	// disabled it stays nil: TTS falls back to on-demand generation and the
	// recording endpoints report unavailable.
	var blobs *blob.Store
	if cfg.StorageEnabled() {
		storageClient, serr := fbApp.Storage(ctx)
		if serr != nil {
			log.Fatalf("storage init failed: %v", serr)
		}
		blobs, err = blob.New(storageClient)
		if err != nil {
			log.Fatalf("storage bucket init failed: %v", err)
		}
	}

	// Subscription gating: a Stripe REST client (used when a secret key is
	// configured) behind a caching entitlement service. When PaywallEnforced is
	// false the service treats everyone as entitled, so local dev is unaffected.
	stripeClient := stripe.New(cfg.StripeSecretKey, cfg.StripeWebhookSecret)
	entService := entitlements.New(st, stripeClient, cfg.PaywallEnforced, cfg.PaywallBypassDomains)

	// Build router, then wrap with logging + CORS (logging outermost so
	// preflight requests are logged too).
	handler := api.NewRouter(st, geminiClient, blobs, verifier, cfg.AuthMode, entService, stripeClient, api.BillingConfig{
		SuccessURL:      cfg.StripeSuccessURL,
		CancelURL:       cfg.StripeCancelURL,
		PortalReturnURL: cfg.StripePortalReturnURL,
		MonthlyPriceID:  cfg.StripePriceMonthly,
		YearlyPriceID:   cfg.StripePriceYearly,
		LifetimePriceID: cfg.StripePriceLifetime,
	})
	handler = api.Logging(api.CORS(cfg.CORSOrigins)(handler))

	addr := ":" + cfg.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("still server listening on %s (auth=%s store=%s)", addr, cfg.AuthMode, cfg.Store)
		if serr := srv.ListenAndServe(); serr != nil && !errors.Is(serr, http.ErrServerClosed) {
			log.Fatalf("server error: %v", serr)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("graceful shutdown failed: %v", err)
	}
	log.Println("server stopped")
}
