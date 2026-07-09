package api

import (
	"context"
	"io"
	"log"
	"net/http"

	"still/server/internal/auth"
	"still/server/internal/stripe"
)

// maxWebhookBytes caps the size of a webhook body we read for signing.
const maxWebhookBytes = 1 << 20

// --- checkout / portal (authenticated, not gated) ---

// planDef is a configured, purchasable plan.
type planDef struct {
	key     string // "monthly" | "yearly" | "lifetime"
	priceID string
	mode    string // "subscription" | "payment"
}

// planDefs returns the plans that are actually configured (non-empty price id),
// in display order.
func (a *API) planDefs() []planDef {
	defs := []planDef{
		{"monthly", a.billing.MonthlyPriceID, "subscription"},
		{"yearly", a.billing.YearlyPriceID, "subscription"},
		{"lifetime", a.billing.LifetimePriceID, "payment"},
	}
	out := make([]planDef, 0, len(defs))
	for _, d := range defs {
		if d.priceID != "" {
			out = append(out, d)
		}
	}
	return out
}

func (a *API) planByKey(key string) (planDef, bool) {
	for _, d := range a.planDefs() {
		if d.key == key {
			return d, true
		}
	}
	return planDef{}, false
}

// getPlans returns the configured plans with live prices from Stripe so the
// client can present and compare them. A plan whose price can't be read is still
// listed (amount 0) so the client can at least show its name.
func (a *API) getPlans(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.uid(w, r); !ok {
		return
	}
	type planOut struct {
		Key      string `json:"key"`
		Mode     string `json:"mode"`
		PriceID  string `json:"priceId"`
		Amount   int64  `json:"amount"`
		Currency string `json:"currency"`
		Interval string `json:"interval"`
	}
	defs := a.planDefs()
	out := make([]planOut, 0, len(defs))
	for _, d := range defs {
		p := planOut{Key: d.key, Mode: d.mode, PriceID: d.priceID}
		if a.stripe != nil && a.stripe.Configured() {
			if price, err := a.stripe.FetchPrice(r.Context(), d.priceID); err == nil {
				p.Amount = price.Amount
				p.Currency = price.Currency
				p.Interval = price.Interval
			} else {
				log.Printf("stripe: fetch price %s: %v", d.priceID, err)
			}
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

// createCheckout starts a Stripe Checkout Session for the chosen plan and
// returns its hosted URL for the client to open in a browser.
func (a *API) createCheckout(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if a.stripe == nil || !a.stripe.Configured() {
		writeError(w, http.StatusServiceUnavailable, "billing not configured")
		return
	}

	var body struct {
		Plan string `json:"plan"`
	}
	_ = decodeJSON(r, &body)
	plan, ok := a.planByKey(body.Plan)
	if !ok {
		writeError(w, http.StatusBadRequest, "unknown plan")
		return
	}

	// Reuse the user's existing Stripe customer when we already know it, so
	// re-purchasing doesn't create a duplicate customer.
	var customerID string
	if ent, found, err := a.store.Entitlement(r.Context(), uid); err == nil && found {
		customerID = ent.StripeCustomerID
	}

	success, cancel := a.checkoutURLs(r)
	url, err := a.stripe.CreateCheckoutSession(r.Context(), stripe.CheckoutParams{
		UID:        uid,
		Email:      auth.EmailFromContext(r.Context()),
		CustomerID: customerID,
		PriceID:    plan.priceID,
		Mode:       plan.mode,
		SuccessURL: success,
		CancelURL:  cancel,
	})
	if err != nil {
		log.Printf("stripe: create checkout %s: %v", uid, err)
		writeError(w, http.StatusBadGateway, "failed to start checkout")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// createPortal opens the Stripe billing portal for the current user, where they
// can update payment, view invoices, or cancel. Requires a known customer.
func (a *API) createPortal(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if a.stripe == nil || !a.stripe.Configured() {
		writeError(w, http.StatusServiceUnavailable, "billing not configured")
		return
	}

	ent, found, err := a.store.Entitlement(r.Context(), uid)
	if err != nil || !found || ent.StripeCustomerID == "" {
		writeError(w, http.StatusConflict, "no_subscription")
		return
	}

	url, err := a.stripe.CreatePortalSession(r.Context(), ent.StripeCustomerID, a.portalReturnURL(r))
	if err != nil {
		log.Printf("stripe: create portal %s: %v", uid, err)
		writeError(w, http.StatusBadGateway, "failed to open billing portal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// --- webhook (public, signature-verified) ---

// stripeWebhook receives subscription lifecycle events from Stripe, verifies the
// signature, updates the stored entitlement, and re-resolves canonical state.
func (a *API) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	if a.stripe == nil || !a.stripe.WebhookConfigured() {
		writeError(w, http.StatusServiceUnavailable, "webhook not configured")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	evt, err := a.stripe.VerifyWebhook(body, r.Header.Get("Stripe-Signature"))
	if err != nil {
		log.Printf("stripe webhook: verify failed: %v", err)
		writeError(w, http.StatusBadRequest, "invalid signature")
		return
	}

	a.applyStripeEvent(r.Context(), evt)
	w.WriteHeader(http.StatusOK)
}

// applyStripeEvent updates the store from a verified webhook event. Unmapped or
// unhandled events are acknowledged (logged) so Stripe stops retrying.
func (a *API) applyStripeEvent(ctx context.Context, evt stripe.Event) {
	if evt.UID == "" {
		log.Printf("stripe webhook: %s without uid metadata; ignoring", evt.Type)
		return
	}

	switch {
	case evt.Type == "checkout.session.completed":
		existing, _, _ := a.store.Entitlement(ctx, evt.UID)
		existing.Active = true
		existing.Source = "webhook"
		existing.Store = "stripe"
		if evt.CustomerID != "" {
			existing.StripeCustomerID = evt.CustomerID
		}
		if evt.CheckoutMode == "payment" {
			// One-time (lifetime) purchase: permanent access, no subscription to
			// re-resolve. Mark it and stop — a live subscription lookup would find
			// nothing and wrongly revoke it (entitlements skips lifetime anyway).
			existing.PeriodType = "lifetime"
			existing.WillRenew = false
			existing.IsTrial = false
			existing.ExpiresAt = ""
			existing.ProductID = a.billing.LifetimePriceID
			if err := a.store.SaveEntitlement(ctx, evt.UID, existing); err != nil {
				log.Printf("stripe webhook: save entitlement %s: %v", evt.UID, err)
			}
			a.ent.Invalidate(evt.UID)
			log.Printf("stripe webhook: lifetime purchase uid=%s", evt.UID)
			return
		}
		// Subscription: mark active now, then re-resolve live to fill in period
		// end / renewal from the new subscription.
		if err := a.store.SaveEntitlement(ctx, evt.UID, existing); err != nil {
			log.Printf("stripe webhook: save entitlement %s: %v", evt.UID, err)
		}
		a.ent.Invalidate(evt.UID)
		if _, err := a.ent.Refresh(ctx, evt.UID); err != nil {
			log.Printf("stripe webhook: refresh %s: %v", evt.UID, err)
		}

	case evt.Subscription != nil:
		// customer.subscription.created / updated / deleted.
		ent := stripe.EntitlementFromSubscription(evt.Subscription)
		if evt.CustomerID != "" {
			ent.StripeCustomerID = evt.CustomerID
		}
		if err := a.store.SaveEntitlement(ctx, evt.UID, ent); err != nil {
			log.Printf("stripe webhook: save entitlement %s: %v", evt.UID, err)
		}
		a.ent.Invalidate(evt.UID)
		log.Printf("stripe webhook: %s uid=%s active=%t", evt.Type, evt.UID, ent.Active)

	default:
		log.Printf("stripe webhook: unhandled %s uid=%s", evt.Type, evt.UID)
	}
}

// --- return pages (public) ---

// billingReturnHTML renders the small page Stripe redirects to after Checkout.
// It nudges the user back into the app (custom scheme) and shows a manual link.
func billingReturnHTML(title, message string) string {
	return `<!doctype html><html><head><meta charset="utf-8">` +
		`<meta name="viewport" content="width=device-width, initial-scale=1">` +
		`<title>` + title + `</title>` +
		`<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F6F1E8;color:#1F1D1A;` +
		`display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}` +
		`.card{max-width:22rem;padding:2rem}a.btn{display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;` +
		`background:#CC785C;color:#fff;border-radius:999px;text-decoration:none;font-weight:600}` +
		`p{color:#6b6b63;line-height:1.5}</style>` +
		`<script>setTimeout(function(){location.href="still://paywall"},400)</script></head>` +
		`<body><div class="card"><h1>` + title + `</h1><p>` + message + `</p>` +
		`<a class="btn" href="still://paywall">Return to Still</a></div></body></html>`
}

func (a *API) billingSuccess(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, billingReturnHTML("Payment received", "Your subscription is active. Returning you to Still…"))
}

func (a *API) billingCancel(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, billingReturnHTML("Checkout canceled", "No charge was made. You can subscribe any time from Still."))
}

// --- URL helpers ---

// baseURL reconstructs this server's externally reachable origin from the
// request, honouring a reverse proxy's X-Forwarded-Proto when present.
func (a *API) baseURL(r *http.Request) string {
	scheme := "http"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// checkoutURLs returns the configured success/cancel URLs, falling back to this
// server's /billing return pages.
func (a *API) checkoutURLs(r *http.Request) (success, cancel string) {
	base := a.baseURL(r)
	success = a.billing.SuccessURL
	if success == "" {
		success = base + "/billing/success"
	}
	cancel = a.billing.CancelURL
	if cancel == "" {
		cancel = base + "/billing/cancel"
	}
	return success, cancel
}

func (a *API) portalReturnURL(r *http.Request) string {
	if a.billing.PortalReturnURL != "" {
		return a.billing.PortalReturnURL
	}
	return a.baseURL(r) + "/billing/success"
}
