// Package config loads the server's runtime configuration from the environment.
package config

import (
	"log"
	"os"
	"strings"
)

// Auth modes.
const (
	AuthModeFirebase = "firebase"
	AuthModeDisabled = "disabled"
)

// Store backends.
const (
	StoreFirestore = "firestore"
	StoreMemory    = "memory"
)

// Config holds all runtime settings, resolved from environment variables.
type Config struct {
	Port string // TCP port to listen on.

	AuthMode string // "firebase" | "disabled"
	Store    string // "firestore" | "memory"

	ProjectID string // Firebase / GCP project id.

	// Exactly one credential source is typically set. If neither
	// CredentialsFile nor CredentialsJSON is provided, Firebase falls back to
	// Application Default Credentials.
	CredentialsFile string // path to a service account JSON file.
	CredentialsJSON string // inline service account JSON.

	GeminiAPIKey   string
	GeminiModel    string
	GeminiTTSModel string

	// StorageBucket is the default Cloud Storage bucket (e.g.
	// "your-project.appspot.com" or "your-project.firebasestorage.app"). When
	// set (and Firebase is available) it enables TTS-audio persistence and voice
	// recording storage.
	StorageBucket string

	CORSOrigins []string // allowed origins; ["*"] means any.

	// RevenueCat subscription gating.
	RevenueCatSecretKey     string // REST secret key (sk_...); enables server-side verification.
	RevenueCatEntitlementID string // entitlement identifier in the dashboard, e.g. "pro".
	RevenueCatWebhookAuth   string // expected value of the webhook's Authorization header.
	RevenueCatSandbox       bool   // send X-Is-Sandbox on REST calls (Test Store / sandbox testing).
	PaywallEnforced         bool   // when true, protected endpoints require an active entitlement.
	// PaywallBypassDomains are email domains (verified) that always have full
	// access, bypassing the paywall — e.g. internal company accounts.
	PaywallBypassDomains []string
}

// Load reads configuration from the environment, applying defaults.
// A local .env file (if present in the working directory) is loaded first,
// but never overrides variables already set in the real environment.
func Load() Config {
	loadDotEnv(".env")

	cfg := Config{
		Port:            getenv("PORT", "8080"),
		AuthMode:        getenv("AUTH_MODE", AuthModeFirebase),
		Store:           getenv("STORE", StoreFirestore),
		ProjectID:       os.Getenv("FIREBASE_PROJECT_ID"),
		CredentialsFile: os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"),
		CredentialsJSON: os.Getenv("FIREBASE_SERVICE_ACCOUNT_JSON"),
		GeminiAPIKey:    os.Getenv("GEMINI_API_KEY"),
		GeminiModel:     getenv("GEMINI_MODEL", "gemini-2.5-flash"),
		GeminiTTSModel:  getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts"),
		StorageBucket:   normalizeBucket(os.Getenv("FIREBASE_STORAGE_BUCKET")),
		CORSOrigins:     parseOrigins(getenv("CORS_ORIGINS", "*")),

		RevenueCatSecretKey:     os.Getenv("REVENUECAT_SECRET_KEY"),
		RevenueCatEntitlementID: getenv("REVENUECAT_ENTITLEMENT_ID", "pro"),
		RevenueCatWebhookAuth:   os.Getenv("REVENUECAT_WEBHOOK_AUTH"),
		RevenueCatSandbox:       parseBool(os.Getenv("REVENUECAT_SANDBOX")),
		PaywallBypassDomains:    parseDomains(getenv("PAYWALL_BYPASS_DOMAINS", "famproperties.com")),
	}

	// Normalize to known values.
	if cfg.AuthMode != AuthModeDisabled {
		cfg.AuthMode = AuthModeFirebase
	}
	if cfg.Store != StoreMemory {
		cfg.Store = StoreFirestore
	}

	// Paywall enforcement defaults on when a RevenueCat secret key is present and
	// off otherwise (so zero-setup local dev is unaffected). PAYWALL_ENFORCED, when
	// set, overrides the default in either direction.
	cfg.PaywallEnforced = strings.TrimSpace(cfg.RevenueCatSecretKey) != ""
	if v := strings.TrimSpace(os.Getenv("PAYWALL_ENFORCED")); v != "" {
		cfg.PaywallEnforced = parseBool(v)
	}
	return cfg
}

// NeedsFirebase reports whether a Firebase app must be initialized.
func (c Config) NeedsFirebase() bool {
	return c.AuthMode == AuthModeFirebase || c.Store == StoreFirestore
}

// StorageEnabled reports whether Cloud Storage persistence should be used. It
// requires both a configured bucket and an available Firebase app.
func (c Config) StorageEnabled() bool {
	return c.StorageBucket != "" && c.NeedsFirebase()
}

// LogEffective logs the resolved auth/store modes. It never logs secrets.
// The storage bucket name is not a secret and is logged to aid diagnosis.
func (c Config) LogEffective() {
	bucket := c.StorageBucket
	if bucket == "" {
		bucket = "(unset)"
	}
	bypass := "(none)"
	if len(c.PaywallBypassDomains) > 0 {
		bypass = strings.Join(c.PaywallBypassDomains, ",")
	}
	log.Printf("config: AUTH_MODE=%s STORE=%s PORT=%s gemini=%s storage=%s bucket=%s paywall=%s revenuecat=%s bypass=%s",
		c.AuthMode, c.Store, c.Port, geminiState(c.GeminiAPIKey), storageState(c.StorageEnabled()), bucket,
		storageState(c.PaywallEnforced), geminiState(c.RevenueCatSecretKey), bypass)
}

// parseBool interprets common truthy string values ("1", "true", "yes", "on").
func parseBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on", "y", "t":
		return true
	default:
		return false
	}
}

// normalizeBucket accepts either a bare bucket name
// ("my-app.firebasestorage.app") or a gs:// URI and returns the bare name the
// Firebase Admin SDK expects (no scheme, no trailing slash).
func normalizeBucket(raw string) string {
	b := strings.TrimSpace(raw)
	b = strings.TrimPrefix(b, "gs://")
	b = strings.TrimSuffix(b, "/")
	return b
}

func storageState(enabled bool) string {
	if enabled {
		return "on"
	}
	return "off"
}

func geminiState(key string) string {
	if strings.TrimSpace(key) == "" {
		return "disabled"
	}
	return "configured"
}

// parseDomains splits a comma-separated list of email domains, lowercasing each
// and stripping any leading "@". Returns nil when empty.
func parseDomains(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		p = strings.TrimPrefix(p, "@")
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func parseOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}
