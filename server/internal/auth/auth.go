// Package auth provides HTTP middleware that authenticates requests using
// Firebase ID tokens and exposes the resolved user identity via the request
// context.
package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"firebase.google.com/go/v4/auth"

	"still/server/internal/config"
)

// DevUID is the fixed user id used when auth is disabled (local development).
const DevUID = "dev-user"

type contextKey int

const (
	uidKey contextKey = iota
	emailKey
	emailVerifiedKey
)

// Verifier is the subset of *auth.Client the middleware needs. It lets tests
// substitute a fake and keeps the dependency explicit.
type Verifier interface {
	VerifyIDToken(ctx context.Context, idToken string) (*auth.Token, error)
}

// Middleware authenticates incoming requests.
//
//   - mode == config.AuthModeDisabled: sets a fixed dev uid and calls next.
//   - mode == config.AuthModeFirebase: requires "Authorization: Bearer <token>",
//     verifies it, and injects the uid (and email claim, if present) into the
//     request context. On any failure it responds 401 with a JSON error.
func Middleware(verifier Verifier, mode string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if mode == config.AuthModeDisabled {
				ctx := context.WithValue(r.Context(), uidKey, DevUID)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			token := bearerToken(r.Header.Get("Authorization"))
			if token == "" || verifier == nil {
				unauthorized(w)
				return
			}

			tok, err := verifier.VerifyIDToken(r.Context(), token)
			if err != nil {
				unauthorized(w)
				return
			}

			ctx := context.WithValue(r.Context(), uidKey, tok.UID)
			if email := claimString(tok.Claims, "email"); email != "" {
				ctx = context.WithValue(ctx, emailKey, email)
			}
			if verified, ok := tok.Claims["email_verified"].(bool); ok && verified {
				ctx = context.WithValue(ctx, emailVerifiedKey, true)
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UIDFromContext returns the authenticated user's uid, if present.
func UIDFromContext(ctx context.Context) (string, bool) {
	uid, ok := ctx.Value(uidKey).(string)
	if !ok || uid == "" {
		return "", false
	}
	return uid, true
}

// EmailFromContext returns the authenticated user's email, or "" if unknown.
func EmailFromContext(ctx context.Context) string {
	email, _ := ctx.Value(emailKey).(string)
	return email
}

// EmailVerifiedFromContext reports whether the token's email_verified claim was
// true. Used to gate the internal-domain paywall bypass.
func EmailVerifiedFromContext(ctx context.Context) bool {
	v, _ := ctx.Value(emailVerifiedKey).(bool)
	return v
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

func claimString(claims map[string]interface{}, key string) string {
	if claims == nil {
		return ""
	}
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
