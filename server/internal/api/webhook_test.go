package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"still/server/internal/config"
	"still/server/internal/entitlements"
	"still/server/internal/gemini"
	"still/server/internal/store"
	"still/server/internal/stripe"
)

const testWebhookSecret = "whsec_test"

// newWebhookRouter builds a router backed by the real entitlement service with
// enforcement on and no Stripe API key, so resolution falls back to the
// webhook-maintained store value — exactly the webhook-driven production path.
func newWebhookRouter() http.Handler {
	st := store.NewMemoryStore()
	sc := stripe.New("" /* no api key */, testWebhookSecret)
	svc := entitlements.New(st, sc, true /* enforced */, nil /* no bypass */)
	return NewRouter(st, gemini.New("", "", ""), nil, nil, config.AuthModeDisabled, svc, sc, BillingConfig{})
}

// signStripe builds a valid Stripe-Signature header for a body at time ts.
func signStripe(secret, body string, ts int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.%s", ts, body)))
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

func postWebhook(h http.Handler, sig, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/stripe/webhook", strings.NewReader(body))
	if sig != "" {
		req.Header.Set("Stripe-Signature", sig)
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

// subEvent builds a customer.subscription.updated body for the fixed dev-user
// (auth is disabled, so the gate resolves uid "dev-user").
func subEvent(status string, periodEnd int64) string {
	return fmt.Sprintf(`{"type":"customer.subscription.updated","data":{"object":{`+
		`"id":"sub_1","customer":"cus_1","status":%q,"cancel_at_period_end":false,`+
		`"current_period_end":%d,"metadata":{"uid":"dev-user"},`+
		`"items":{"data":[{"price":{"id":"price_1"}}]}}}}`, status, periodEnd)
}

func TestWebhookRejectsBadSignature(t *testing.T) {
	h := newWebhookRouter()
	body := subEvent("active", time.Now().Add(24*time.Hour).Unix())

	if rec := postWebhook(h, "", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing signature: got %d, want 400", rec.Code)
	}
	if rec := postWebhook(h, "t=1,v1=deadbeef", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("wrong signature: got %d, want 400", rec.Code)
	}
}

func TestWebhookOpensAndClosesGate(t *testing.T) {
	h := newWebhookRouter()
	now := time.Now().Unix()
	future := time.Now().Add(24 * time.Hour).Unix()

	// No entitlement yet → gated route refused.
	if code := getStatus(h, "/api/journals"); code != http.StatusPaymentRequired {
		t.Fatalf("before subscription: got %d, want 402", code)
	}

	// An active subscription opens the gate.
	active := subEvent("active", future)
	if rec := postWebhook(h, signStripe(testWebhookSecret, active, now), active); rec.Code != http.StatusOK {
		t.Fatalf("active webhook: got %d, want 200", rec.Code)
	}
	if code := getStatus(h, "/api/journals"); code != http.StatusOK {
		t.Fatalf("after subscription: got %d, want 200", code)
	}

	// A canceled subscription closes it again.
	canceled := subEvent("canceled", future)
	if rec := postWebhook(h, signStripe(testWebhookSecret, canceled, now), canceled); rec.Code != http.StatusOK {
		t.Fatalf("cancel webhook: got %d, want 200", rec.Code)
	}
	if code := getStatus(h, "/api/journals"); code != http.StatusPaymentRequired {
		t.Fatalf("after cancel: got %d, want 402", code)
	}
}
