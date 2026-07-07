package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	fbauth "firebase.google.com/go/v4/auth"

	"still/server/internal/config"
	"still/server/internal/entitlements"
	"still/server/internal/gemini"
	"still/server/internal/revenuecat"
	"still/server/internal/store"
)

// tokenVerifier returns a fixed token, standing in for Firebase verification so
// we can exercise the email-domain bypass with real auth middleware.
type tokenVerifier struct{ tok *fbauth.Token }

func (v tokenVerifier) VerifyIDToken(context.Context, string) (*fbauth.Token, error) {
	return v.tok, nil
}

// bypassRouter builds a router with the paywall enforced (no RevenueCat key) and
// famproperties.com allowlisted, authenticating via the given claims.
func bypassRouter(claims map[string]any) http.Handler {
	st := store.NewMemoryStore()
	svc := entitlements.New(st, revenuecat.New("", "pro", false), true, []string{"famproperties.com"})
	verifier := tokenVerifier{tok: &fbauth.Token{UID: "u1", Claims: claims}}
	return NewRouter(st, gemini.New("", "", ""), nil, verifier, config.AuthModeFirebase, svc, "", "pro")
}

func gatedGet(h http.Handler) int {
	req := httptest.NewRequest(http.MethodGet, "/api/journals", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestInternalDomainBypassesPaywall(t *testing.T) {
	h := bypassRouter(map[string]any{"email": "adbhut.m@famproperties.com", "email_verified": true})
	if code := gatedGet(h); code != http.StatusOK {
		t.Fatalf("verified famproperties.com user: got %d, want 200 (bypass)", code)
	}
}

func TestExternalDomainStillGated(t *testing.T) {
	h := bypassRouter(map[string]any{"email": "someone@gmail.com", "email_verified": true})
	if code := gatedGet(h); code != http.StatusPaymentRequired {
		t.Fatalf("external user without subscription: got %d, want 402", code)
	}
}

func TestUnverifiedInternalEmailStillGated(t *testing.T) {
	// An unverified email must not unlock access, even on the allowlisted domain.
	h := bypassRouter(map[string]any{"email": "spoof@famproperties.com", "email_verified": false})
	if code := gatedGet(h); code != http.StatusPaymentRequired {
		t.Fatalf("unverified famproperties.com email: got %d, want 402", code)
	}
}
