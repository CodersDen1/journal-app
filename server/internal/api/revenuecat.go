package api

import (
	"crypto/subtle"
	"log"
	"net/http"
	"strings"
	"time"

	"still/server/internal/model"
)

// webhookEvent is the subset of a RevenueCat webhook payload we consume. The
// dashboard wraps every event as {"event": {...}}. Fields we don't need are
// ignored. Note that webhook enum values are UPPERCASE (e.g. "TRIAL",
// "APP_STORE"), unlike the REST API's lowercase.
type webhookEvent struct {
	Event struct {
		ID             string   `json:"id"`
		Type           string   `json:"type"`
		AppUserID      string   `json:"app_user_id"`
		ProductID      string   `json:"product_id"`
		EntitlementIDs []string `json:"entitlement_ids"`
		PeriodType     string   `json:"period_type"`
		Store          string   `json:"store"`
		ExpirationAtMs int64    `json:"expiration_at_ms"`
	} `json:"event"`
}

// revenueCatWebhook receives subscription events from RevenueCat and updates the
// stored entitlement. It authenticates with a shared Authorization header value
// configured in the RevenueCat dashboard, then re-resolves canonical state.
func (a *API) revenueCatWebhook(w http.ResponseWriter, r *http.Request) {
	if a.webhookAuth == "" {
		writeError(w, http.StatusServiceUnavailable, "webhook not configured")
		return
	}
	// Constant-time comparison of the shared secret to avoid timing leaks.
	got := r.Header.Get("Authorization")
	if subtle.ConstantTimeCompare([]byte(got), []byte(a.webhookAuth)) != 1 {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var evt webhookEvent
	if err := decodeJSON(r, &evt); err != nil {
		writeError(w, http.StatusBadRequest, "invalid webhook body")
		return
	}
	uid := evt.Event.AppUserID
	if uid == "" {
		// Nothing actionable, but acknowledge so RevenueCat stops retrying.
		w.WriteHeader(http.StatusOK)
		return
	}

	// 1. Persist a value derived from the event so the store reflects it even
	//    when server-side REST verification is unavailable (no secret key or a
	//    transient outage). This is what keeps the gate correct without a key.
	derived := a.entitlementFromEvent(evt)
	if err := a.store.SaveEntitlement(r.Context(), uid, derived); err != nil {
		log.Printf("revenuecat webhook: save entitlement %s: %v", uid, err)
	}
	a.ent.Invalidate(uid)

	// 2. Re-resolve canonically. When a secret key is configured this performs an
	//    authoritative REST lookup that overwrites the derived value; otherwise it
	//    simply re-reads and caches what we just stored. Errors are non-fatal —
	//    the derived value already stands.
	if _, err := a.ent.Refresh(r.Context(), uid); err != nil {
		log.Printf("revenuecat webhook: refresh %s: %v", uid, err)
	}

	log.Printf("revenuecat webhook: %s uid=%s active=%t", evt.Event.Type, uid, derived.Active)
	w.WriteHeader(http.StatusOK)
}

// entitlementFromEvent derives an Entitlement from a webhook payload. It is a
// best-effort fallback; the REST API is authoritative when configured.
func (a *API) entitlementFromEvent(evt webhookEvent) model.Entitlement {
	e := evt.Event
	now := time.Now()

	expires := ""
	future := false
	if e.ExpirationAtMs > 0 {
		exp := time.UnixMilli(e.ExpirationAtMs).UTC()
		expires = exp.Format(time.RFC3339)
		future = exp.After(now)
	}

	relevant := contains(e.EntitlementIDs, a.entitlementID)
	// EXPIRATION / SUBSCRIPTION_PAUSED / TRANSFER revoke access regardless of the
	// (possibly stale) expiration timestamp in the payload.
	revoked := e.Type == "EXPIRATION" || e.Type == "SUBSCRIPTION_PAUSED" || e.Type == "TRANSFER"
	active := relevant && future && !revoked

	period := strings.ToLower(e.PeriodType)
	return model.Entitlement{
		Active:     active,
		ProductID:  e.ProductID,
		Store:      strings.ToLower(e.Store),
		PeriodType: period,
		ExpiresAt:  expires,
		WillRenew:  active && e.Type != "CANCELLATION" && e.Type != "BILLING_ISSUE",
		IsTrial:    period == "trial",
		UpdatedAt:  now.UTC().Format(time.RFC3339),
		Source:     "webhook",
	}
}

func contains(ss []string, target string) bool {
	for _, s := range ss {
		if s == target {
			return true
		}
	}
	return false
}
