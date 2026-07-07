package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"still/server/internal/config"
	"still/server/internal/entitlements"
	"still/server/internal/gemini"
	"still/server/internal/revenuecat"
	"still/server/internal/store"
)

const testWebhookAuth = "whsecret"

// newWebhookRouter builds a router backed by the real entitlement service with
// enforcement on and no RevenueCat key, so resolution falls back to the
// webhook-maintained store value — exactly the no-key production/dev path.
func newWebhookRouter() http.Handler {
	st := store.NewMemoryStore()
	svc := entitlements.New(st, revenuecat.New("", "pro", false), true /* enforced */, nil /* no bypass */)
	return NewRouter(st, gemini.New("", "", ""), nil, nil, config.AuthModeDisabled, svc, testWebhookAuth, "pro")
}

func postWebhook(h http.Handler, auth, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/revenuecat/webhook", strings.NewReader(body))
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func getStatus(h http.Handler, path string) int {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec.Code
}

// event builds a webhook body for the fixed dev-user (auth is disabled, so the
// gate resolves uid "dev-user").
func event(eventType string, expiresMs int64) string {
	return fmt.Sprintf(`{"event":{"type":%q,"app_user_id":"dev-user","product_id":"still_pro_monthly","entitlement_ids":["pro"],"period_type":"TRIAL","store":"APP_STORE","expiration_at_ms":%d}}`, eventType, expiresMs)
}

func TestWebhookRejectsBadAuth(t *testing.T) {
	h := newWebhookRouter()
	future := time.Now().Add(24 * time.Hour).UnixMilli()

	if rec := postWebhook(h, "", event("INITIAL_PURCHASE", future)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing auth: got %d, want 401", rec.Code)
	}
	if rec := postWebhook(h, "wrong", event("INITIAL_PURCHASE", future)); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong auth: got %d, want 401", rec.Code)
	}
}

func TestWebhookOpensAndClosesGate(t *testing.T) {
	h := newWebhookRouter()
	future := time.Now().Add(24 * time.Hour).UnixMilli()

	// No entitlement yet → gated route refused.
	if code := getStatus(h, "/api/journals"); code != http.StatusPaymentRequired {
		t.Fatalf("before purchase: got %d, want 402", code)
	}

	// A purchase event opens the gate.
	if rec := postWebhook(h, testWebhookAuth, event("INITIAL_PURCHASE", future)); rec.Code != http.StatusOK {
		t.Fatalf("purchase webhook: got %d, want 200", rec.Code)
	}
	if code := getStatus(h, "/api/journals"); code != http.StatusOK {
		t.Fatalf("after purchase: got %d, want 200", code)
	}

	// An expiration event closes it again.
	if rec := postWebhook(h, testWebhookAuth, event("EXPIRATION", future)); rec.Code != http.StatusOK {
		t.Fatalf("expiration webhook: got %d, want 200", rec.Code)
	}
	if code := getStatus(h, "/api/journals"); code != http.StatusPaymentRequired {
		t.Fatalf("after expiration: got %d, want 402", code)
	}
}
