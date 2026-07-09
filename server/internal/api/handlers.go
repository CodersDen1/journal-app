package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"still/server/internal/auth"
	"still/server/internal/blob"
	"still/server/internal/gemini"
	"still/server/internal/model"
	"still/server/internal/store"
	"still/server/internal/stripe"
)

// maxAudioBytes caps the size of an uploaded audio file (~20MB).
const maxAudioBytes = 20 << 20

// Entitler resolves a user's subscription entitlement. It is satisfied by
// *entitlements.Service; the interface keeps the dependency explicit and lets
// tests substitute a fake.
type Entitler interface {
	IsEntitled(ctx context.Context, uid string) (bool, error)
	Get(ctx context.Context, uid string) (model.Entitlement, error)
	Refresh(ctx context.Context, uid string) (model.Entitlement, error)
	Invalidate(uid string)
}

// BillingConfig holds the Stripe redirect URLs and the plan price ids. Empty URL
// fields are derived from the incoming request host; a plan with an empty price
// id is simply not offered.
type BillingConfig struct {
	SuccessURL      string
	CancelURL       string
	PortalReturnURL string
	MonthlyPriceID  string
	YearlyPriceID   string
	LifetimePriceID string
}

// API holds the dependencies shared by the HTTP handlers.
type API struct {
	store    store.Store
	gemini   *gemini.Client
	ttsCache *ttsCache
	blobs    *blob.Store // Cloud Storage; nil when storage is disabled.
	ent      Entitler
	// stripe drives subscription billing. It is safe when unconfigured (billing
	// endpoints report unavailable) — see Configured()/WebhookConfigured().
	stripe  *stripe.Client
	billing BillingConfig
}

// New returns an API bound to the given store, Gemini client, (optional) blob
// store, entitlement resolver, Stripe client, and billing config. A nil blobs
// disables Storage-backed persistence.
func New(s store.Store, g *gemini.Client, blobs *blob.Store, ent Entitler, sc *stripe.Client, billing BillingConfig) *API {
	return &API{
		store:    s,
		gemini:   g,
		ttsCache: newTTSCache(ttsCacheCap),
		blobs:    blobs,
		ent:      ent,
		stripe:   sc,
		billing:  billing,
	}
}

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// writeError writes a JSON error body: {"error":"..."}.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// decodeJSON decodes the request body into dst. It is lenient about unknown
// fields to tolerate client shape drift.
func decodeJSON(r *http.Request, dst any) error {
	return json.NewDecoder(r.Body).Decode(dst)
}

// uid extracts the authenticated user id, writing 401 if it is missing.
func (a *API) uid(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := auth.UIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	return uid, true
}

// --- health ---

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- me ---

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"uid":   uid,
		"email": auth.EmailFromContext(r.Context()),
	})
}

// --- entitlement / paywall gate ---

// requireEntitlement wraps a handler so it runs only when the authenticated user
// has an active subscription entitlement. Otherwise it writes 402 Payment
// Required. This is the server-side gate — the client cannot bypass it.
func (a *API) requireEntitlement(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := a.uid(w, r)
		if !ok {
			return
		}
		entitled, err := a.ent.IsEntitled(r.Context(), uid)
		if err != nil {
			// Fail closed: an error resolving entitlement denies access.
			writeError(w, http.StatusPaymentRequired, "subscription_required")
			return
		}
		if !entitled {
			writeJSON(w, http.StatusPaymentRequired, map[string]any{
				"error":    "subscription_required",
				"entitled": false,
			})
			return
		}
		next(w, r)
	}
}

// getEntitlement returns the authoritative entitlement for the current user.
// The client uses it to decide whether to show the app or the paywall.
func (a *API) getEntitlement(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	ent, err := a.ent.Get(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve entitlement")
		return
	}
	writeJSON(w, http.StatusOK, ent)
}

// refreshEntitlement forces a re-check against Stripe and returns the fresh
// entitlement. The client calls this after returning from Checkout or the portal.
func (a *API) refreshEntitlement(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	ent, err := a.ent.Refresh(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to refresh entitlement")
		return
	}
	writeJSON(w, http.StatusOK, ent)
}

// planForEntitlement maps an entitlement to the profile's display plan string.
func planForEntitlement(ctx context.Context, ent Entitler, uid string) string {
	e, err := ent.Get(ctx, uid)
	if err == nil && e.Active {
		return "pro"
	}
	return "free"
}

// --- journals ---

func (a *API) listJournals(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	entries, err := a.store.ListEntries(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list entries")
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (a *API) createJournal(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	var e model.JournalEntry
	if err := decodeJSON(r, &e); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	created, err := a.store.CreateEntry(r.Context(), uid, e)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create entry")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (a *API) getJournal(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	e, found, err := a.store.GetEntry(r.Context(), uid, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get entry")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (a *API) updateJournal(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	var e model.JournalEntry
	if err := decodeJSON(r, &e); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updated, found, err := a.store.UpdateEntry(r.Context(), uid, r.PathValue("id"), e)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update entry")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *API) deleteJournal(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	found, err := a.store.DeleteEntry(r.Context(), uid, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete entry")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "entry not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- insights ---

// parsePeriod resolves the period query param, defaulting to "weekly". It
// returns ("", false) and writes a 400 for anything other than weekly/monthly.
func parsePeriod(w http.ResponseWriter, r *http.Request) (string, bool) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "weekly"
	}
	if period != "weekly" && period != "monthly" {
		writeError(w, http.StatusBadRequest, "period must be weekly or monthly")
		return "", false
	}
	return period, true
}

func (a *API) getInsights(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	period, ok := parsePeriod(w, r)
	if !ok {
		return
	}
	if err := a.store.EnsureUser(r.Context(), uid); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	digest, found, err := a.store.Insight(r.Context(), uid, period)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load insight")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "insight not found")
		return
	}
	writeJSON(w, http.StatusOK, digest)
}

func (a *API) generateInsights(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	period, ok := parsePeriod(w, r)
	if !ok {
		return
	}
	if err := a.store.EnsureUser(r.Context(), uid); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	// Try live generation with Gemini; fall back to the stored/canned digest.
	if a.gemini != nil && a.gemini.Configured() {
		entries, err := a.store.ListEntries(r.Context(), uid)
		if err == nil {
			if digest, gerr := a.gemini.GenerateInsight(r.Context(), period, entries); gerr == nil {
				if serr := a.store.SaveInsight(r.Context(), uid, digest); serr == nil {
					writeJSON(w, http.StatusOK, digest)
					return
				}
			}
		}
		// Any failure falls through to the stored digest below.
	}

	digest, found, err := a.store.Insight(r.Context(), uid, period)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load insight")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "insight not found")
		return
	}
	writeJSON(w, http.StatusOK, digest)
}

// --- profile ---

func (a *API) getProfile(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if err := a.store.EnsureUser(r.Context(), uid); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	p, err := a.store.Profile(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load profile")
		return
	}
	// Plan is server-authoritative: it always reflects the resolved entitlement,
	// never whatever the client last stored.
	p.Plan = planForEntitlement(r.Context(), a.ent, uid)
	writeJSON(w, http.StatusOK, p)
}

func (a *API) updateProfile(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	var p model.ProfileSettings
	if err := decodeJSON(r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Never trust a client-supplied plan; it is derived from the entitlement.
	p.Plan = planForEntitlement(r.Context(), a.ent, uid)
	updated, err := a.store.UpdateProfile(r.Context(), uid, p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// --- transcription ---

// mimeForExt maps a lowercased file extension to an audio MIME type.
var mimeForExt = map[string]string{
	".m4a":  "audio/mp4",
	".mp4":  "audio/mp4",
	".mp3":  "audio/mp3",
	".wav":  "audio/wav",
	".aac":  "audio/aac",
	".ogg":  "audio/ogg",
	".flac": "audio/flac",
}

func (a *API) transcribe(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.uid(w, r); !ok {
		return
	}
	if a.gemini == nil || !a.gemini.Configured() {
		writeError(w, http.StatusServiceUnavailable, "transcription is not configured")
		return
	}

	// Cap the in-memory portion of the multipart parse.
	if err := r.ParseMultipartForm(maxAudioBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing audio file field")
		return
	}
	defer file.Close()

	if header.Size > maxAudioBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "audio file too large")
		return
	}

	// Read at most maxAudioBytes+1 so we can detect an oversized stream even if
	// the header size was unreliable.
	audio, err := readLimited(w, file)
	if err != nil {
		return
	}

	transcript, err := a.gemini.Transcribe(r.Context(), audio, mimeForFilename(header.Filename))
	if err != nil {
		if errors.Is(err, gemini.ErrNotConfigured) {
			writeError(w, http.StatusServiceUnavailable, "transcription is not configured")
			return
		}
		writeError(w, http.StatusBadGateway, "transcription failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"transcript": transcript})
}
