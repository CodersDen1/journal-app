// Package entitlements resolves and caches a user's subscription entitlement.
//
// It is the single source the API gate consults. Resolution combines three
// layers, in order of authority: an authoritative RevenueCat REST lookup, the
// webhook-maintained value in the store, and a short-lived in-memory cache in
// front of both. When enforcement is disabled (local development without
// RevenueCat) every user is treated as entitled.
package entitlements

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"still/server/internal/auth"
	"still/server/internal/model"
	"still/server/internal/revenuecat"
	"still/server/internal/store"
)

// defaultTTL is how long a resolved entitlement stays fresh in the in-memory
// cache before the next request triggers re-resolution.
const defaultTTL = 60 * time.Second

type cacheEntry struct {
	ent       model.Entitlement
	fetchedAt time.Time
}

// Service resolves entitlements for the API layer.
type Service struct {
	store    store.Store
	rc       *revenuecat.Client
	enforced bool
	ttl      time.Duration
	bypass   map[string]bool // verified email domains that always have full access

	mu    sync.Mutex
	cache map[string]cacheEntry
}

// New builds a Service. When enforced is false, IsEntitled always returns true
// and Get/Refresh report an active ("disabled") entitlement so the client gate
// opens — this preserves the zero-setup local dev workflow. bypassDomains are
// verified email domains (e.g. internal company accounts) granted full access.
func New(s store.Store, rc *revenuecat.Client, enforced bool, bypassDomains []string) *Service {
	bypass := make(map[string]bool, len(bypassDomains))
	for _, d := range bypassDomains {
		bypass[strings.ToLower(strings.TrimSpace(d))] = true
	}
	return &Service{
		store:    s,
		rc:       rc,
		enforced: enforced,
		ttl:      defaultTTL,
		bypass:   bypass,
		cache:    make(map[string]cacheEntry),
	}
}

// isBypassed reports whether the request's user has a verified email on a
// bypass domain. It reads the identity the auth middleware put on the context,
// so it can't be spoofed by the client.
func (s *Service) isBypassed(ctx context.Context) bool {
	if len(s.bypass) == 0 || !auth.EmailVerifiedFromContext(ctx) {
		return false
	}
	email := strings.ToLower(auth.EmailFromContext(ctx))
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return false
	}
	return s.bypass[email[at+1:]]
}

// IsEntitled reports whether the user currently has active access. This is the
// gate's decision function.
func (s *Service) IsEntitled(ctx context.Context, uid string) (bool, error) {
	if !s.enforced || s.isBypassed(ctx) {
		return true, nil
	}
	ent, err := s.resolve(ctx, uid, false)
	if err != nil {
		return false, err
	}
	return ent.Active, nil
}

// Get returns the entitlement to report to the client. When enforcement is off
// it reports active so the client gate opens in development.
func (s *Service) Get(ctx context.Context, uid string) (model.Entitlement, error) {
	if !s.enforced {
		return disabledOverride(), nil
	}
	if s.isBypassed(ctx) {
		return bypassOverride(), nil
	}
	return s.resolve(ctx, uid, false)
}

// Refresh forces an authoritative re-resolution (bypassing the cache), persists
// it, and returns it. The client calls this right after a purchase/restore, and
// the webhook calls it on every event.
func (s *Service) Refresh(ctx context.Context, uid string) (model.Entitlement, error) {
	if !s.enforced {
		return disabledOverride(), nil
	}
	if s.isBypassed(ctx) {
		return bypassOverride(), nil
	}
	return s.resolve(ctx, uid, true)
}

// Invalidate drops the cached entry for a user so the next read re-resolves.
func (s *Service) Invalidate(uid string) {
	s.mu.Lock()
	delete(s.cache, uid)
	s.mu.Unlock()
}

// resolve returns the user's entitlement using cache → RevenueCat REST → store,
// failing closed (inactive) when nothing authoritative is available. When force
// is true the cache is skipped.
func (s *Service) resolve(ctx context.Context, uid string, force bool) (model.Entitlement, error) {
	if !force {
		if ent, ok := s.cached(uid); ok {
			return ent, nil
		}
	}

	// 1. Authoritative: RevenueCat REST API.
	if s.rc != nil && s.rc.Configured() {
		ent, err := s.rc.FetchEntitlement(ctx, uid)
		if err == nil {
			if serr := s.store.SaveEntitlement(ctx, uid, ent); serr != nil {
				log.Printf("entitlements: persist %s: %v", uid, serr)
			}
			s.put(uid, ent)
			return ent, nil
		}
		// Transport/HTTP failure: fall back to the webhook-maintained value.
		log.Printf("entitlements: revenuecat lookup %s failed, falling back to store: %v", uid, err)
	}

	// 2. Webhook-maintained value in the store.
	ent, found, err := s.store.Entitlement(ctx, uid)
	if err != nil {
		// Store failure with no authoritative answer: fail closed.
		return model.Entitlement{Active: false, Source: "none"}, err
	}
	if found {
		s.put(uid, ent)
		return ent, nil
	}

	// 3. Nothing recorded anywhere → inactive (fail closed).
	inactive := model.Entitlement{Active: false, Source: "none", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
	s.put(uid, inactive)
	return inactive, nil
}

func (s *Service) cached(uid string) (model.Entitlement, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.cache[uid]
	if !ok || time.Since(e.fetchedAt) > s.ttl {
		return model.Entitlement{}, false
	}
	return e.ent, true
}

func (s *Service) put(uid string, ent model.Entitlement) {
	s.mu.Lock()
	s.cache[uid] = cacheEntry{ent: ent, fetchedAt: time.Now()}
	s.mu.Unlock()
}

// disabledOverride is the entitlement reported when enforcement is disabled.
func disabledOverride() model.Entitlement {
	return model.Entitlement{Active: true, Source: "disabled", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
}

// bypassOverride is the entitlement reported for an allowlisted internal domain.
func bypassOverride() model.Entitlement {
	return model.Entitlement{Active: true, Source: "internal", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
}
