package store

import (
	"context"
	"sort"
	"strconv"
	"sync"
	"time"

	"still/server/internal/model"
)

// userData holds one user's in-memory state.
type userData struct {
	entries  map[string]model.JournalEntry
	insights map[string]model.InsightDigest // keyed by periodType
	profile  model.ProfileSettings
}

// MemoryStore is a thread-safe, in-process Store. It is intended for local
// development and testing without Firestore.
type MemoryStore struct {
	mu      sync.RWMutex
	users   map[string]*userData
	counter int64
}

// NewMemoryStore returns an empty in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{users: make(map[string]*userData)}
}

// getOrSeed returns the user's data, seeding defaults if it doesn't exist.
// Callers must hold the write lock.
func (s *MemoryStore) getOrSeed(uid string) *userData {
	if u, ok := s.users[uid]; ok {
		return u
	}
	u := &userData{
		entries:  make(map[string]model.JournalEntry),
		insights: make(map[string]model.InsightDigest),
		profile:  defaultProfile(),
	}
	u.insights["weekly"] = cannedInsight("weekly")
	u.insights["monthly"] = cannedInsight("monthly")
	s.users[uid] = u
	return u
}

func (s *MemoryStore) nextID() string {
	s.counter++
	return "entry-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "-" + strconv.FormatInt(s.counter, 10)
}

// EnsureUser seeds the user's default profile and canned insights if absent.
func (s *MemoryStore) EnsureUser(_ context.Context, uid string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getOrSeed(uid)
	return nil
}

// ListEntries returns the user's non-deleted entries, newest-first.
func (s *MemoryStore) ListEntries(_ context.Context, uid string) ([]model.JournalEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, ok := s.users[uid]
	if !ok {
		return []model.JournalEntry{}, nil
	}
	out := make([]model.JournalEntry, 0, len(u.entries))
	for _, e := range u.entries {
		if e.Deleted {
			continue
		}
		normalizeEntry(&e)
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt > out[j].CreatedAt // RFC3339 sorts lexically
	})
	return out, nil
}

// GetEntry returns the entry and whether it exists (non-deleted).
func (s *MemoryStore) GetEntry(_ context.Context, uid, id string) (model.JournalEntry, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, ok := s.users[uid]
	if !ok {
		return model.JournalEntry{}, false, nil
	}
	e, ok := u.entries[id]
	if !ok || e.Deleted {
		return model.JournalEntry{}, false, nil
	}
	normalizeEntry(&e)
	return e, true, nil
}

// CreateEntry stores a new entry, filling in id/timestamps when absent.
func (s *MemoryStore) CreateEntry(_ context.Context, uid string, e model.JournalEntry) (model.JournalEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := s.getOrSeed(uid)
	now := time.Now().UTC().Format(time.RFC3339)
	if e.ID == "" {
		e.ID = s.nextID()
	}
	if e.CreatedAt == "" {
		e.CreatedAt = now
	}
	if e.UpdatedAt == "" {
		e.UpdatedAt = now
	}
	normalizeEntry(&e)
	u.entries[e.ID] = e
	return e, nil
}

// UpdateEntry replaces an entry, preserving createdAt when the body omits it.
func (s *MemoryStore) UpdateEntry(_ context.Context, uid, id string, e model.JournalEntry) (model.JournalEntry, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u, ok := s.users[uid]
	if !ok {
		return model.JournalEntry{}, false, nil
	}
	existing, ok := u.entries[id]
	if !ok {
		return model.JournalEntry{}, false, nil
	}

	e.ID = id
	if e.CreatedAt == "" {
		e.CreatedAt = existing.CreatedAt
	}
	e.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	normalizeEntry(&e)
	u.entries[id] = e
	return e, true, nil
}

// DeleteEntry soft-deletes an entry. Returns false if not found.
func (s *MemoryStore) DeleteEntry(_ context.Context, uid, id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u, ok := s.users[uid]
	if !ok {
		return false, nil
	}
	e, ok := u.entries[id]
	if !ok || e.Deleted {
		return false, nil
	}
	e.Deleted = true
	e.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	u.entries[id] = e
	return true, nil
}

// Insight returns the digest for the period ("weekly"|"monthly").
func (s *MemoryStore) Insight(_ context.Context, uid, period string) (model.InsightDigest, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := s.getOrSeed(uid)
	d, ok := u.insights[period]
	if !ok {
		return model.InsightDigest{}, false, nil
	}
	normalizeInsight(&d)
	return d, true, nil
}

// SaveInsight stores/overwrites the digest for its period.
func (s *MemoryStore) SaveInsight(_ context.Context, uid string, d model.InsightDigest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := s.getOrSeed(uid)
	normalizeInsight(&d)
	u.insights[d.PeriodType] = d
	return nil
}

// Profile returns the user's profile, seeding defaults if needed.
func (s *MemoryStore) Profile(_ context.Context, uid string) (model.ProfileSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := s.getOrSeed(uid)
	return u.profile, nil
}

// UpdateProfile replaces the user's profile and returns the stored value.
func (s *MemoryStore) UpdateProfile(_ context.Context, uid string, p model.ProfileSettings) (model.ProfileSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := s.getOrSeed(uid)
	u.profile = p
	return u.profile, nil
}

// Close is a no-op for the in-memory store.
func (s *MemoryStore) Close() error { return nil }
