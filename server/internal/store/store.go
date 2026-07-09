// Package store defines the persistence interface for the Still app and its
// Firestore and in-memory implementations. Every method is scoped by the
// authenticated user's uid.
package store

import (
	"context"

	"still/server/internal/model"
)

// Store is the persistence contract. All data is scoped per uid.
type Store interface {
	EnsureUser(ctx context.Context, uid string) error
	ListEntries(ctx context.Context, uid string) ([]model.JournalEntry, error)
	GetEntry(ctx context.Context, uid, id string) (model.JournalEntry, bool, error)
	CreateEntry(ctx context.Context, uid string, e model.JournalEntry) (model.JournalEntry, error)
	UpdateEntry(ctx context.Context, uid, id string, e model.JournalEntry) (model.JournalEntry, bool, error)
	DeleteEntry(ctx context.Context, uid, id string) (bool, error)
	Insight(ctx context.Context, uid, period string) (model.InsightDigest, bool, error)
	SaveInsight(ctx context.Context, uid string, d model.InsightDigest) error
	Profile(ctx context.Context, uid string) (model.ProfileSettings, error)
	UpdateProfile(ctx context.Context, uid string, p model.ProfileSettings) (model.ProfileSettings, error)
	// Entitlement returns the user's cached subscription entitlement. found is
	// false when nothing has been recorded yet (treat as inactive).
	Entitlement(ctx context.Context, uid string) (model.Entitlement, bool, error)
	// SaveEntitlement records the user's entitlement. It is written only by the
	// Stripe webhook and server-side REST verification, never by the client.
	SaveEntitlement(ctx context.Context, uid string, e model.Entitlement) error
	Close() error
}

// defaultEntitlement returns the inactive entitlement used before any
// Stripe signal has been recorded for a user.
func defaultEntitlement() model.Entitlement {
	return model.Entitlement{Active: false, Source: "none"}
}

// defaultProfile returns the seed profile for a new user.
func defaultProfile() model.ProfileSettings {
	return model.ProfileSettings{
		AccountEmail:          nil,
		Plan:                  "free",
		AppLockEnabled:        false,
		BackupEnabled:         false,
		DefaultEntryMode:      "text",
		TranscriptionLanguage: "English (US)",
		TextToSpeechVoice:     "Warm",
		ReminderRhythm:        "daily",
		MissedYesterdayNudge:  true,
	}
}

// cannedInsight returns the seed digest for the given period.
func cannedInsight(period string) model.InsightDigest {
	if period == "monthly" {
		return model.InsightDigest{
			ID:            "insight-monthly",
			PeriodType:    "monthly",
			PeriodLabel:   "This month",
			Summary:       "A month of reclaiming pace.",
			Patterns:      []string{"Slowness is a recurring theme.", "You record more on weekends and after time outdoors."},
			EmotionalTone: "Reflective, grounded, hopeful",
			Recommendations: []string{
				"Protect one unhurried day each week.",
				"Reach for voice notes on hard days.",
			},
			SuggestedPrompt: "Where did you feel most like yourself this month?",
			RelatedEntryIds: []string{},
		}
	}
	return model.InsightDigest{
		ID:            "insight-weekly",
		PeriodType:    "weekly",
		PeriodLabel:   "This week",
		Summary:       "A steadier week than the last. Your mornings anchored you.",
		Patterns:      []string{"You write most often in the early morning.", "Walks and conversations reliably lift your mood."},
		EmotionalTone: "Calm, quietly proud, occasionally tired",
		Recommendations: []string{
			"Keep the slow morning hour.",
			"Name a lingering worry to someone sooner.",
		},
		SuggestedPrompt: "What did you protect this week, and what did you let go of?",
		RelatedEntryIds: []string{},
	}
}

// normalizeInsight ensures string slices serialize as [] rather than null.
func normalizeInsight(d *model.InsightDigest) {
	if d.Patterns == nil {
		d.Patterns = []string{}
	}
	if d.Recommendations == nil {
		d.Recommendations = []string{}
	}
	if d.RelatedEntryIds == nil {
		d.RelatedEntryIds = []string{}
	}
}

// normalizeEntry ensures the photos slice is non-nil so it serializes as [].
func normalizeEntry(e *model.JournalEntry) {
	if e.Photos == nil {
		e.Photos = []string{}
	}
}
