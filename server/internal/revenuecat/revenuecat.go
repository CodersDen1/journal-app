// Package revenuecat is a minimal server-side client for RevenueCat's REST API.
//
// It is used to authoritatively resolve a user's subscription entitlement from
// RevenueCat (the source of truth), independent of anything the mobile client
// claims. Only the standard library is used, matching the rest of the backend.
package revenuecat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"still/server/internal/model"
)

// apiBase is the RevenueCat REST API v1 root. The subscriber endpoint is
// GET /subscribers/{app_user_id}.
const apiBase = "https://api.revenuecat.com/v1"

// Client talks to the RevenueCat REST API with a secret key. The zero-value /
// unconfigured client (empty secret key) reports Configured() == false so the
// caller can fall back to webhook-maintained state.
type Client struct {
	secretKey     string
	entitlementID string
	sandbox       bool // send X-Is-Sandbox so Test Store / sandbox purchases are returned
	http          *http.Client
}

// New returns a RevenueCat client. entitlementID is the identifier configured in
// the RevenueCat dashboard (e.g. "pro"); it defaults to "pro" when empty. When
// sandbox is true the REST calls include the X-Is-Sandbox header so Test Store
// and sandbox transactions appear in the subscriber object.
func New(secretKey, entitlementID string, sandbox bool) *Client {
	if strings.TrimSpace(entitlementID) == "" {
		entitlementID = "pro"
	}
	return &Client{
		secretKey:     strings.TrimSpace(secretKey),
		entitlementID: entitlementID,
		sandbox:       sandbox,
		http:          &http.Client{Timeout: 10 * time.Second},
	}
}

// Configured reports whether a secret key is set. When false, callers should not
// attempt REST verification and should rely on webhook-maintained state.
func (c *Client) Configured() bool { return c.secretKey != "" }

// EntitlementID returns the entitlement identifier this client resolves.
func (c *Client) EntitlementID() string { return c.entitlementID }

// subscriberResponse mirrors the parts of the /subscribers/{id} payload we use.
type subscriberResponse struct {
	Subscriber struct {
		Entitlements  map[string]entitlementInfo  `json:"entitlements"`
		Subscriptions map[string]subscriptionInfo `json:"subscriptions"`
	} `json:"subscriber"`
}

type entitlementInfo struct {
	ExpiresDate            *string `json:"expires_date"`
	GracePeriodExpiresDate *string `json:"grace_period_expires_date"`
	ProductIdentifier      string  `json:"product_identifier"`
	PurchaseDate           *string `json:"purchase_date"`
}

type subscriptionInfo struct {
	ExpiresDate             *string `json:"expires_date"`
	PeriodType              string  `json:"period_type"` // "trial" | "intro" | "normal"
	Store                   string  `json:"store"`       // "app_store" | "play_store" | ...
	UnsubscribeDetectedAt   *string `json:"unsubscribe_detected_at"`
	BillingIssuesDetectedAt *string `json:"billing_issues_detected_at"`
}

// FetchEntitlement resolves the current entitlement for the given app user id
// (which is the Firebase uid). It returns an inactive entitlement (not an error)
// when the subscriber exists but has no active access; it returns an error only
// on transport/HTTP failures so callers can decide how to fall back.
func (c *Client) FetchEntitlement(ctx context.Context, appUserID string) (model.Entitlement, error) {
	if !c.Configured() {
		return model.Entitlement{}, fmt.Errorf("revenuecat: not configured")
	}

	endpoint := apiBase + "/subscribers/" + url.PathEscape(appUserID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return model.Entitlement{}, fmt.Errorf("revenuecat: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Accept", "application/json")
	if c.sandbox {
		req.Header.Set("X-Is-Sandbox", "true")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return model.Entitlement{}, fmt.Errorf("revenuecat: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return model.Entitlement{}, fmt.Errorf("revenuecat: read body: %w", err)
	}
	// 404 means "no such subscriber yet" — treat as a definitive inactive result.
	if resp.StatusCode == http.StatusNotFound {
		return inactive(), nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return model.Entitlement{}, fmt.Errorf("revenuecat: status %d", resp.StatusCode)
	}

	var parsed subscriberResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return model.Entitlement{}, fmt.Errorf("revenuecat: decode: %w", err)
	}
	return c.resolve(parsed), nil
}

// resolve converts a subscriber payload into our entitlement model, considering
// only the configured entitlement id.
func (c *Client) resolve(r subscriberResponse) model.Entitlement {
	ent, ok := r.Subscriber.Entitlements[c.entitlementID]
	if !ok {
		return inactive()
	}

	now := time.Now()
	active := isFutureOrNull(ent.ExpiresDate, now) || isFuture(ent.GracePeriodExpiresDate, now)

	out := model.Entitlement{
		Active:    active,
		ProductID: ent.ProductIdentifier,
		ExpiresAt: derefTime(ent.ExpiresDate),
		UpdatedAt: now.UTC().Format(time.RFC3339),
		Source:    "api",
	}

	// Enrich from the matching subscription record when present.
	if sub, ok := r.Subscriber.Subscriptions[ent.ProductIdentifier]; ok {
		out.Store = sub.Store
		out.PeriodType = sub.PeriodType
		out.IsTrial = sub.PeriodType == "trial"
		out.WillRenew = active && sub.UnsubscribeDetectedAt == nil && sub.BillingIssuesDetectedAt == nil
	}
	return out
}

func inactive() model.Entitlement {
	return model.Entitlement{
		Active:    false,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Source:    "api",
	}
}

// isFutureOrNull reports whether a RevenueCat timestamp is null (non-expiring) or
// strictly in the future. A value that fails to parse is treated as expired.
func isFutureOrNull(ts *string, now time.Time) bool {
	if ts == nil || *ts == "" {
		return true
	}
	return isFuture(ts, now)
}

// isFuture reports whether a non-nil RevenueCat timestamp is strictly in the
// future. nil / empty / unparsable values are not in the future.
func isFuture(ts *string, now time.Time) bool {
	if ts == nil || *ts == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, *ts)
	if err != nil {
		return false
	}
	return t.After(now)
}

func derefTime(ts *string) string {
	if ts == nil {
		return ""
	}
	return *ts
}
