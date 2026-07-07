package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"still/server/internal/model"
)

// FirestoreStore persists app data in Cloud Firestore, laid out per user:
//
//	users/{uid}                    -> ProfileSettings
//	users/{uid}/entries/{entryId}  -> JournalEntry
//	users/{uid}/insights/{period}  -> InsightDigest
type FirestoreStore struct {
	client *firestore.Client
}

// NewFirestoreStore wraps a Firestore client. The store takes ownership of the
// client and closes it in Close.
func NewFirestoreStore(client *firestore.Client) *FirestoreStore {
	return &FirestoreStore{client: client}
}

func (s *FirestoreStore) userDoc(uid string) *firestore.DocumentRef {
	return s.client.Collection("users").Doc(uid)
}

func (s *FirestoreStore) entriesCol(uid string) *firestore.CollectionRef {
	return s.userDoc(uid).Collection("entries")
}

func (s *FirestoreStore) insightDoc(uid, period string) *firestore.DocumentRef {
	return s.userDoc(uid).Collection("insights").Doc(period)
}

// entitlementDoc points at the user's subscription entitlement. It lives in its
// own subcollection doc — never in the profile doc — so client profile writes
// cannot grant access.
func (s *FirestoreStore) entitlementDoc(uid string) *firestore.DocumentRef {
	return s.userDoc(uid).Collection("billing").Doc("entitlement")
}

func isNotFound(err error) bool {
	return status.Code(err) == codes.NotFound
}

// EnsureUser creates the user document with the default profile and seeds the
// two canned insight digests when the user doesn't exist yet. It never seeds
// journal entries.
func (s *FirestoreStore) EnsureUser(ctx context.Context, uid string) error {
	doc := s.userDoc(uid)
	_, err := doc.Get(ctx)
	if err == nil {
		return nil // already exists
	}
	if !isNotFound(err) {
		return fmt.Errorf("firestore: get user: %w", err)
	}

	if _, err := doc.Set(ctx, defaultProfile()); err != nil {
		return fmt.Errorf("firestore: seed profile: %w", err)
	}
	for _, period := range []string{"weekly", "monthly"} {
		if _, err := s.insightDoc(uid, period).Set(ctx, cannedInsight(period)); err != nil {
			return fmt.Errorf("firestore: seed insight %s: %w", period, err)
		}
	}
	return nil
}

// ListEntries returns the user's non-deleted entries, newest-first. Deleted
// entries are filtered in Go to avoid needing a composite index.
func (s *FirestoreStore) ListEntries(ctx context.Context, uid string) ([]model.JournalEntry, error) {
	iter := s.entriesCol(uid).OrderBy("createdAt", firestore.Desc).Documents(ctx)
	defer iter.Stop()

	out := make([]model.JournalEntry, 0)
	for {
		snap, err := iter.Next()
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list entries: %w", err)
		}
		var e model.JournalEntry
		if err := snap.DataTo(&e); err != nil {
			return nil, fmt.Errorf("firestore: decode entry: %w", err)
		}
		if e.Deleted {
			continue
		}
		normalizeEntry(&e)
		out = append(out, e)
	}
	return out, nil
}

// GetEntry returns the entry and whether it exists (non-deleted).
func (s *FirestoreStore) GetEntry(ctx context.Context, uid, id string) (model.JournalEntry, bool, error) {
	snap, err := s.entriesCol(uid).Doc(id).Get(ctx)
	if isNotFound(err) {
		return model.JournalEntry{}, false, nil
	}
	if err != nil {
		return model.JournalEntry{}, false, fmt.Errorf("firestore: get entry: %w", err)
	}
	var e model.JournalEntry
	if err := snap.DataTo(&e); err != nil {
		return model.JournalEntry{}, false, fmt.Errorf("firestore: decode entry: %w", err)
	}
	if e.Deleted {
		return model.JournalEntry{}, false, nil
	}
	normalizeEntry(&e)
	return e, true, nil
}

// CreateEntry writes a new entry, generating an id and timestamps when absent.
func (s *FirestoreStore) CreateEntry(ctx context.Context, uid string, e model.JournalEntry) (model.JournalEntry, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if e.ID == "" {
		e.ID = s.entriesCol(uid).NewDoc().ID
	}
	if e.CreatedAt == "" {
		e.CreatedAt = now
	}
	if e.UpdatedAt == "" {
		e.UpdatedAt = now
	}
	normalizeEntry(&e)

	if _, err := s.entriesCol(uid).Doc(e.ID).Set(ctx, e); err != nil {
		return model.JournalEntry{}, fmt.Errorf("firestore: create entry: %w", err)
	}
	return e, nil
}

// UpdateEntry replaces an entry, preserving createdAt when the body omits it.
// Returns (…, false, nil) when the entry does not exist.
func (s *FirestoreStore) UpdateEntry(ctx context.Context, uid, id string, e model.JournalEntry) (model.JournalEntry, bool, error) {
	ref := s.entriesCol(uid).Doc(id)
	snap, err := ref.Get(ctx)
	if isNotFound(err) {
		return model.JournalEntry{}, false, nil
	}
	if err != nil {
		return model.JournalEntry{}, false, fmt.Errorf("firestore: get entry: %w", err)
	}

	var existing model.JournalEntry
	if err := snap.DataTo(&existing); err != nil {
		return model.JournalEntry{}, false, fmt.Errorf("firestore: decode entry: %w", err)
	}

	e.ID = id
	if e.CreatedAt == "" {
		e.CreatedAt = existing.CreatedAt
	}
	e.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	normalizeEntry(&e)

	if _, err := ref.Set(ctx, e); err != nil {
		return model.JournalEntry{}, false, fmt.Errorf("firestore: update entry: %w", err)
	}
	return e, true, nil
}

// DeleteEntry soft-deletes an entry (deleted=true). Returns false if not found.
func (s *FirestoreStore) DeleteEntry(ctx context.Context, uid, id string) (bool, error) {
	ref := s.entriesCol(uid).Doc(id)
	if _, err := ref.Get(ctx); err != nil {
		if isNotFound(err) {
			return false, nil
		}
		return false, fmt.Errorf("firestore: get entry: %w", err)
	}

	updates := []firestore.Update{
		{Path: "deleted", Value: true},
		{Path: "updatedAt", Value: time.Now().UTC().Format(time.RFC3339)},
	}
	if _, err := ref.Update(ctx, updates); err != nil {
		return false, fmt.Errorf("firestore: delete entry: %w", err)
	}
	return true, nil
}

// Insight reads the digest for the period ("weekly"|"monthly").
func (s *FirestoreStore) Insight(ctx context.Context, uid, period string) (model.InsightDigest, bool, error) {
	snap, err := s.insightDoc(uid, period).Get(ctx)
	if isNotFound(err) {
		return model.InsightDigest{}, false, nil
	}
	if err != nil {
		return model.InsightDigest{}, false, fmt.Errorf("firestore: get insight: %w", err)
	}
	var d model.InsightDigest
	if err := snap.DataTo(&d); err != nil {
		return model.InsightDigest{}, false, fmt.Errorf("firestore: decode insight: %w", err)
	}
	normalizeInsight(&d)
	return d, true, nil
}

// SaveInsight writes the digest to users/{uid}/insights/{periodType}.
func (s *FirestoreStore) SaveInsight(ctx context.Context, uid string, d model.InsightDigest) error {
	normalizeInsight(&d)
	if _, err := s.insightDoc(uid, d.PeriodType).Set(ctx, d); err != nil {
		return fmt.Errorf("firestore: save insight: %w", err)
	}
	return nil
}

// Profile reads the user's profile, seeding defaults if the user is new.
func (s *FirestoreStore) Profile(ctx context.Context, uid string) (model.ProfileSettings, error) {
	snap, err := s.userDoc(uid).Get(ctx)
	if isNotFound(err) {
		if err := s.EnsureUser(ctx, uid); err != nil {
			return model.ProfileSettings{}, err
		}
		return defaultProfile(), nil
	}
	if err != nil {
		return model.ProfileSettings{}, fmt.Errorf("firestore: get profile: %w", err)
	}
	var p model.ProfileSettings
	if err := snap.DataTo(&p); err != nil {
		return model.ProfileSettings{}, fmt.Errorf("firestore: decode profile: %w", err)
	}
	return p, nil
}

// UpdateProfile writes the user's profile and returns the stored value.
func (s *FirestoreStore) UpdateProfile(ctx context.Context, uid string, p model.ProfileSettings) (model.ProfileSettings, error) {
	if _, err := s.userDoc(uid).Set(ctx, p); err != nil {
		return model.ProfileSettings{}, fmt.Errorf("firestore: update profile: %w", err)
	}
	return p, nil
}

// Entitlement reads the user's recorded entitlement. Returns (…, false, nil)
// when nothing has been recorded yet.
func (s *FirestoreStore) Entitlement(ctx context.Context, uid string) (model.Entitlement, bool, error) {
	snap, err := s.entitlementDoc(uid).Get(ctx)
	if isNotFound(err) {
		return defaultEntitlement(), false, nil
	}
	if err != nil {
		return model.Entitlement{}, false, fmt.Errorf("firestore: get entitlement: %w", err)
	}
	var e model.Entitlement
	if err := snap.DataTo(&e); err != nil {
		return model.Entitlement{}, false, fmt.Errorf("firestore: decode entitlement: %w", err)
	}
	return e, true, nil
}

// SaveEntitlement writes the user's entitlement to users/{uid}/billing/entitlement.
func (s *FirestoreStore) SaveEntitlement(ctx context.Context, uid string, e model.Entitlement) error {
	if _, err := s.entitlementDoc(uid).Set(ctx, e); err != nil {
		return fmt.Errorf("firestore: save entitlement: %w", err)
	}
	return nil
}

// Close closes the underlying Firestore client.
func (s *FirestoreStore) Close() error {
	if s.client == nil {
		return nil
	}
	return s.client.Close()
}
