// Package stripe is a minimal, dependency-free client for the parts of the
// Stripe API the Still backend needs: creating subscription Checkout Sessions,
// opening the customer billing portal, resolving a customer's subscription
// entitlement, and verifying incoming webhook signatures.
//
// Only the standard library is used, matching the rest of the backend. Requests
// are application/x-www-form-urlencoded (Stripe's wire format) authenticated
// with the secret key; responses are JSON.
package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"still/server/internal/model"
)

// apiBase is the Stripe REST API root.
const apiBase = "https://api.stripe.com/v1"

// webhookTolerance is the maximum accepted age of a webhook's signature
// timestamp, guarding against replay of captured payloads.
const webhookTolerance = 5 * time.Minute

// Client talks to the Stripe REST API. The zero-value / unconfigured client
// (empty secret key) reports Configured() == false so callers can no-op.
type Client struct {
	secretKey     string
	webhookSecret string
	http          *http.Client
	// now is time.Now, overridable in tests for signature-tolerance checks.
	now func() time.Time
}

// New returns a Stripe client. Any of the values may be empty (e.g. local dev
// without billing); the relevant capability is then reported as unconfigured.
func New(secretKey, webhookSecret string) *Client {
	return &Client{
		secretKey:     strings.TrimSpace(secretKey),
		webhookSecret: strings.TrimSpace(webhookSecret),
		http:          &http.Client{Timeout: 15 * time.Second},
		now:           time.Now,
	}
}

// Configured reports whether a secret key is set (Checkout / portal / lookups).
func (c *Client) Configured() bool { return c.secretKey != "" }

// WebhookConfigured reports whether a signing secret is set (webhook handling).
func (c *Client) WebhookConfigured() bool { return c.webhookSecret != "" }

// CheckoutParams describes a Checkout Session to create.
type CheckoutParams struct {
	UID        string // Firebase uid; travels on the session + resulting object metadata.
	Email      string // prefills Checkout when no existing customer is reused.
	CustomerID string // existing Stripe customer to reuse ("" to create a new one).
	PriceID    string // the Stripe price to sell.
	Mode       string // "subscription" (recurring) or "payment" (one-time, e.g. lifetime).
	SuccessURL string
	CancelURL  string
}

// CreateCheckoutSession creates a subscription-mode Checkout Session and returns
// its hosted URL. The uid is stamped onto both the session (client_reference_id
// + metadata) and the resulting subscription (subscription_data.metadata) so the
// webhook can map events back to our user.
func (c *Client) CreateCheckoutSession(ctx context.Context, p CheckoutParams) (string, error) {
	if !c.Configured() {
		return "", fmt.Errorf("stripe: not configured")
	}
	if p.PriceID == "" {
		return "", fmt.Errorf("stripe: no price for plan")
	}
	mode := p.Mode
	if mode == "" {
		mode = "subscription"
	}

	form := url.Values{}
	form.Set("mode", mode)
	form.Set("line_items[0][price]", p.PriceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("success_url", p.SuccessURL)
	form.Set("cancel_url", p.CancelURL)
	form.Set("allow_promotion_codes", "true")
	if p.UID != "" {
		form.Set("client_reference_id", p.UID)
		form.Set("metadata[uid]", p.UID)
		// Stamp the uid where the resulting object carries it back to the webhook.
		if mode == "payment" {
			form.Set("payment_intent_data[metadata][uid]", p.UID)
		} else {
			form.Set("subscription_data[metadata][uid]", p.UID)
		}
	}
	// Reuse an existing customer when known; otherwise prefill the email. A
	// one-time (payment) session must be told to create a customer explicitly.
	if p.CustomerID != "" {
		form.Set("customer", p.CustomerID)
	} else {
		if p.Email != "" {
			form.Set("customer_email", p.Email)
		}
		if mode == "payment" {
			form.Set("customer_creation", "always")
		}
	}

	var out struct {
		URL string `json:"url"`
	}
	if err := c.post(ctx, "/checkout/sessions", form, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", fmt.Errorf("stripe: checkout session returned no url")
	}
	return out.URL, nil
}

// CreatePortalSession creates a billing-portal session for the customer and
// returns its URL, where they can update payment, view invoices, or cancel.
func (c *Client) CreatePortalSession(ctx context.Context, customerID, returnURL string) (string, error) {
	if !c.Configured() {
		return "", fmt.Errorf("stripe: not configured")
	}
	if customerID == "" {
		return "", fmt.Errorf("stripe: no customer id")
	}
	form := url.Values{}
	form.Set("customer", customerID)
	if returnURL != "" {
		form.Set("return_url", returnURL)
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := c.post(ctx, "/billing_portal/sessions", form, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", fmt.Errorf("stripe: portal session returned no url")
	}
	return out.URL, nil
}

// FetchEntitlementByCustomer lists the customer's subscriptions and resolves the
// current entitlement. It returns an inactive entitlement (not an error) when
// the customer has no granting subscription.
func (c *Client) FetchEntitlementByCustomer(ctx context.Context, customerID string) (model.Entitlement, error) {
	if !c.Configured() {
		return model.Entitlement{}, fmt.Errorf("stripe: not configured")
	}
	endpoint := apiBase + "/subscriptions?status=all&limit=100&customer=" + url.QueryEscape(customerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return model.Entitlement{}, fmt.Errorf("stripe: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Accept", "application/json")

	body, err := c.do(req)
	if err != nil {
		return model.Entitlement{}, err
	}

	var list struct {
		Data []subscription `json:"data"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		return model.Entitlement{}, fmt.Errorf("stripe: decode subscriptions: %w", err)
	}

	// Prefer an active/trialing subscription; fall back to the most recent one so
	// the caller still learns the (inactive) product/expiry.
	var best *subscription
	for i := range list.Data {
		s := &list.Data[i]
		if s.granting() {
			best = s
			break
		}
		if best == nil {
			best = s
		}
	}
	if best == nil {
		return inactive("api"), nil
	}
	return best.entitlement("api"), nil
}

// Price is the pricing detail for a plan, read live from Stripe.
type Price struct {
	ID       string
	Amount   int64  // in the currency's smallest unit (e.g. cents)
	Currency string // ISO code, lowercase (e.g. "usd")
	Interval string // "month" | "year" for recurring; "" for one-time
	OneTime  bool
}

// FetchPrice reads a Price object so callers can display real amounts.
func (c *Client) FetchPrice(ctx context.Context, priceID string) (Price, error) {
	if !c.Configured() {
		return Price{}, fmt.Errorf("stripe: not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBase+"/prices/"+url.PathEscape(priceID), nil)
	if err != nil {
		return Price{}, fmt.Errorf("stripe: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Accept", "application/json")
	body, err := c.do(req)
	if err != nil {
		return Price{}, err
	}
	var p struct {
		ID         string `json:"id"`
		UnitAmount int64  `json:"unit_amount"`
		Currency   string `json:"currency"`
		Recurring  *struct {
			Interval string `json:"interval"`
		} `json:"recurring"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return Price{}, fmt.Errorf("stripe: decode price: %w", err)
	}
	out := Price{ID: p.ID, Amount: p.UnitAmount, Currency: p.Currency, OneTime: p.Recurring == nil}
	if p.Recurring != nil {
		out.Interval = p.Recurring.Interval
	}
	return out, nil
}

// --- webhook verification ---

// Event is the normalized subset of a Stripe webhook we act on.
type Event struct {
	Type         string        // e.g. "customer.subscription.updated"
	UID          string        // Firebase uid resolved from metadata / client_reference_id
	CustomerID   string        // Stripe customer id (cus_...)
	CheckoutMode string        // "subscription" | "payment" (set for checkout.session.completed)
	Subscription *Subscription // populated for customer.subscription.* events
}

// Subscription is the normalized subscription state used to build an entitlement.
type Subscription struct {
	ID                string
	Status            string
	PriceID           string
	CurrentPeriodEnd  int64
	CancelAtPeriodEnd bool
}

// VerifyWebhook authenticates a raw webhook payload against the Stripe-Signature
// header using the configured signing secret, then parses it into an Event. It
// errors on a missing/invalid signature, a stale timestamp, or a malformed body.
func (c *Client) VerifyWebhook(payload []byte, sigHeader string) (Event, error) {
	if !c.WebhookConfigured() {
		return Event{}, fmt.Errorf("stripe: webhook secret not configured")
	}
	if err := c.verifySignature(payload, sigHeader); err != nil {
		return Event{}, err
	}

	var env struct {
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &env); err != nil {
		return Event{}, fmt.Errorf("stripe: decode event: %w", err)
	}

	evt := Event{Type: env.Type}
	switch {
	case env.Type == "checkout.session.completed":
		var s checkoutSession
		if err := json.Unmarshal(env.Data.Object, &s); err != nil {
			return Event{}, fmt.Errorf("stripe: decode session: %w", err)
		}
		evt.CustomerID = s.Customer
		evt.CheckoutMode = s.Mode
		evt.UID = s.ClientReferenceID
		if evt.UID == "" {
			evt.UID = s.Metadata["uid"]
		}
	case strings.HasPrefix(env.Type, "customer.subscription."):
		var s subscription
		if err := json.Unmarshal(env.Data.Object, &s); err != nil {
			return Event{}, fmt.Errorf("stripe: decode subscription: %w", err)
		}
		evt.CustomerID = s.Customer
		evt.UID = s.Metadata["uid"]
		sub := s.normalize()
		evt.Subscription = &sub
	}
	return evt, nil
}

// verifySignature checks the HMAC-SHA256 signature per Stripe's scheme: the
// header is "t=<ts>,v1=<hex>[,v1=<hex>...]" and the signed payload is
// "<ts>.<body>". Any v1 matching in constant time passes.
func (c *Client) verifySignature(payload []byte, sigHeader string) error {
	var timestamp string
	var sigs []string
	for _, part := range strings.Split(sigHeader, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			sigs = append(sigs, kv[1])
		}
	}
	if timestamp == "" || len(sigs) == 0 {
		return fmt.Errorf("stripe: malformed signature header")
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return fmt.Errorf("stripe: bad signature timestamp")
	}
	if delta := c.now().Sub(time.Unix(ts, 0)); delta > webhookTolerance || delta < -webhookTolerance {
		return fmt.Errorf("stripe: signature timestamp outside tolerance")
	}

	mac := hmac.New(sha256.New, []byte(c.webhookSecret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	expected := mac.Sum(nil)

	for _, s := range sigs {
		got, derr := hex.DecodeString(s)
		if derr != nil {
			continue
		}
		if hmac.Equal(got, expected) {
			return nil
		}
	}
	return fmt.Errorf("stripe: no matching signature")
}

// --- shared JSON shapes ---

type checkoutSession struct {
	Customer          string            `json:"customer"`
	Subscription      string            `json:"subscription"`
	Mode              string            `json:"mode"` // "subscription" | "payment"
	ClientReferenceID string            `json:"client_reference_id"`
	Metadata          map[string]string `json:"metadata"`
}

// subscription mirrors the fields we read from a Stripe subscription object.
// current_period_end lives on the subscription in most API versions but has
// moved onto items in newer ones, so we read both and prefer whichever is set.
type subscription struct {
	ID                string            `json:"id"`
	Customer          string            `json:"customer"`
	Status            string            `json:"status"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	CurrentPeriodEnd  int64             `json:"current_period_end"`
	Metadata          map[string]string `json:"metadata"`
	Items             struct {
		Data []struct {
			CurrentPeriodEnd int64 `json:"current_period_end"`
			Price            struct {
				ID string `json:"id"`
			} `json:"price"`
		} `json:"data"`
	} `json:"items"`
}

func (s subscription) granting() bool {
	return s.Status == "active" || s.Status == "trialing"
}

func (s subscription) periodEnd() int64 {
	if s.CurrentPeriodEnd > 0 {
		return s.CurrentPeriodEnd
	}
	if len(s.Items.Data) > 0 {
		return s.Items.Data[0].CurrentPeriodEnd
	}
	return 0
}

func (s subscription) priceID() string {
	if len(s.Items.Data) > 0 {
		return s.Items.Data[0].Price.ID
	}
	return ""
}

func (s subscription) normalize() Subscription {
	return Subscription{
		ID:                s.ID,
		Status:            s.Status,
		PriceID:           s.priceID(),
		CurrentPeriodEnd:  s.periodEnd(),
		CancelAtPeriodEnd: s.CancelAtPeriodEnd,
	}
}

func (s subscription) entitlement(source string) model.Entitlement {
	return s.normalize().entitlement(source)
}

// entitlement converts normalized subscription state into our model.
func (s Subscription) entitlement(source string) model.Entitlement {
	active := s.Status == "active" || s.Status == "trialing"
	expires := ""
	if s.CurrentPeriodEnd > 0 {
		expires = time.Unix(s.CurrentPeriodEnd, 0).UTC().Format(time.RFC3339)
	}
	return model.Entitlement{
		Active:     active,
		ProductID:  s.PriceID,
		Store:      "stripe",
		PeriodType: s.Status,
		ExpiresAt:  expires,
		WillRenew:  active && !s.CancelAtPeriodEnd,
		IsTrial:    s.Status == "trialing",
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		Source:     source,
	}
}

// EntitlementFromSubscription builds an entitlement from a webhook-parsed
// subscription (source "webhook").
func EntitlementFromSubscription(s *Subscription) model.Entitlement {
	if s == nil {
		return inactive("webhook")
	}
	return s.entitlement("webhook")
}

func inactive(source string) model.Entitlement {
	return model.Entitlement{Active: false, Store: "stripe", UpdatedAt: time.Now().UTC().Format(time.RFC3339), Source: source}
}

// --- HTTP plumbing ---

// post sends a form-encoded POST and decodes the JSON response into out.
func (c *Client) post(ctx context.Context, path string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+path, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("stripe: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	body, err := c.do(req)
	if err != nil {
		return err
	}
	if out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("stripe: decode response: %w", err)
		}
	}
	return nil
}

// do performs a request and returns the body, converting non-2xx into a useful
// error that includes Stripe's error message when present.
func (c *Client) do(req *http.Request) ([]byte, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stripe: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, fmt.Errorf("stripe: read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		if e.Error.Message != "" {
			return nil, fmt.Errorf("stripe: status %d: %s", resp.StatusCode, e.Error.Message)
		}
		return nil, fmt.Errorf("stripe: status %d", resp.StatusCode)
	}
	return body, nil
}
