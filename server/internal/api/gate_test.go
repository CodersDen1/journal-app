package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"still/server/internal/config"
	"still/server/internal/gemini"
	"still/server/internal/model"
	"still/server/internal/store"
)

// fakeEnt is a controllable Entitler for testing the gate without RevenueCat.
type fakeEnt struct {
	entitled bool
}

func (f *fakeEnt) IsEntitled(context.Context, string) (bool, error) { return f.entitled, nil }
func (f *fakeEnt) Get(context.Context, string) (model.Entitlement, error) {
	return model.Entitlement{Active: f.entitled}, nil
}
func (f *fakeEnt) Refresh(context.Context, string) (model.Entitlement, error) {
	return model.Entitlement{Active: f.entitled}, nil
}
func (f *fakeEnt) Invalidate(string) {}

func newTestRouter(ent Entitler, webhookAuth string) http.Handler {
	return NewRouter(
		store.NewMemoryStore(),
		gemini.New("", "", ""),
		nil, // no blob store
		nil, // no verifier (auth disabled)
		config.AuthModeDisabled,
		ent,
		webhookAuth,
		"pro",
	)
}

func TestGateBlocksWithoutEntitlement(t *testing.T) {
	h := newTestRouter(&fakeEnt{entitled: false}, "")

	// A gated route is refused with 402.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/journals", nil))
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("gated route: got %d, want 402", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "subscription_required") {
		t.Fatalf("gated route body = %q, want subscription_required", rec.Body.String())
	}

	// Un-gated routes remain reachable so the client can learn its status.
	for _, path := range []string{"/api/me", "/api/entitlement"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: got %d, want 200", path, rec.Code)
		}
	}
}

func TestGateAllowsWithEntitlement(t *testing.T) {
	h := newTestRouter(&fakeEnt{entitled: true}, "")

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/journals", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("gated route with entitlement: got %d, want 200", rec.Code)
	}
}
