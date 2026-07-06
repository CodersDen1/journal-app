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
		StorageBucket:   strings.TrimSpace(os.Getenv("FIREBASE_STORAGE_BUCKET")),
		CORSOrigins:     parseOrigins(getenv("CORS_ORIGINS", "*")),
	}

	// Normalize to known values.
	if cfg.AuthMode != AuthModeDisabled {
		cfg.AuthMode = AuthModeFirebase
	}
	if cfg.Store != StoreMemory {
		cfg.Store = StoreFirestore
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
func (c Config) LogEffective() {
	log.Printf("config: AUTH_MODE=%s STORE=%s PORT=%s gemini=%s storage=%s",
		c.AuthMode, c.Store, c.Port, geminiState(c.GeminiAPIKey), storageState(c.StorageEnabled()))
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
