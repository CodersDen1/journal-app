// Package model holds the data types for the Still journaling app.
//
// The JSON tags mirror the mobile app's TypeScript types exactly (camelCase);
// do not rename them without also updating the client. The firestore tags match
// the JSON tags so documents round-trip identically through either codec.
package model

// JournalEntry is a single journal entry, either typed or recorded.
type JournalEntry struct {
	ID            string   `json:"id" firestore:"id"`
	CreatedAt     string   `json:"createdAt" firestore:"createdAt"`
	UpdatedAt     string   `json:"updatedAt" firestore:"updatedAt"`
	Type          string   `json:"type" firestore:"type"` // "text" | "voice"
	Text          string   `json:"text" firestore:"text"`
	Transcript    string   `json:"transcript" firestore:"transcript"`
	AudioURI      *string  `json:"audioUri" firestore:"audioUri"` // nullable
	AudioDuration int      `json:"audioDuration" firestore:"audioDuration"`
	Photos        []string `json:"photos" firestore:"photos"` // never null; empty slice serializes as []
	Favorite      bool     `json:"favorite" firestore:"favorite"`
	Archived      bool     `json:"archived" firestore:"archived"`
	Deleted       bool     `json:"deleted" firestore:"deleted"`
}

// InsightDigest is a generated reflection over a period of entries.
type InsightDigest struct {
	ID              string   `json:"id" firestore:"id"`
	PeriodType      string   `json:"periodType" firestore:"periodType"` // "weekly" | "monthly"
	PeriodLabel     string   `json:"periodLabel" firestore:"periodLabel"`
	Summary         string   `json:"summary" firestore:"summary"`
	Patterns        []string `json:"patterns" firestore:"patterns"`
	EmotionalTone   string   `json:"emotionalTone" firestore:"emotionalTone"`
	Recommendations []string `json:"recommendations" firestore:"recommendations"`
	SuggestedPrompt string   `json:"suggestedPrompt" firestore:"suggestedPrompt"`
	RelatedEntryIds []string `json:"relatedEntryIds" firestore:"relatedEntryIds"`
}

// AskScope is the slice of the journal a question is asked against:
// "week" | "month" | "all".
type AskScope = string

// AskMessage is one turn of an Ask conversation. Role is "user" or "assistant".
// The client replays prior turns so follow-up questions ("and before that?")
// resolve — the server keeps no conversation state.
type AskMessage struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

// AskCitation points at the entry an answer drew on. The server only ever emits
// citations whose EntryID was in the prompt, so a hallucinated id cannot reach
// the client.
type AskCitation struct {
	EntryID string `json:"entryId"`
	Date    string `json:"date"`  // CreatedAt of the cited entry (RFC3339)
	Quote   string `json:"quote"` // short excerpt the model leaned on
}

// AskAnswer is the reply to one question about the journal.
type AskAnswer struct {
	Answer      string        `json:"answer"`
	Citations   []AskCitation `json:"citations"`
	FollowUps   []string      `json:"followUps"`   // 2-3 natural next questions
	EntriesUsed int           `json:"entriesUsed"` // entries in scope that reached the model
	Truncated   bool          `json:"truncated"`   // the period held more entries than fit in one prompt
}

// Entitlement is the user's resolved subscription access, derived from Stripe.
// It is the server's source of truth for gating and is written only by the
// Stripe webhook and server-side REST verification — never by the client. It is
// stored separately from ProfileSettings so a profile write can never grant
// access.
type Entitlement struct {
	Active     bool   `json:"active" firestore:"active"`         // any active "pro" access, including a free trial
	ProductID  string `json:"productId" firestore:"productId"`   // Stripe price id, e.g. "price_123"
	Store      string `json:"store" firestore:"store"`           // "stripe" | ""
	PeriodType string `json:"periodType" firestore:"periodType"` // Stripe subscription status, e.g. "active" | "trialing" | ""
	ExpiresAt  string `json:"expiresAt" firestore:"expiresAt"`   // RFC3339 of current period end, or "" when unknown
	WillRenew  bool   `json:"willRenew" firestore:"willRenew"`
	IsTrial    bool   `json:"isTrial" firestore:"isTrial"`
	UpdatedAt  string `json:"updatedAt" firestore:"updatedAt"` // RFC3339 of the last resolution
	Source     string `json:"source" firestore:"source"`       // "webhook" | "api" | "none" | "disabled" | "internal"
	// StripeCustomerID links the user to their Stripe customer so the billing
	// portal and live verification can find their subscriptions. Never "" once a
	// checkout has completed.
	StripeCustomerID string `json:"stripeCustomerId" firestore:"stripeCustomerId"`
}

// ProfileSettings holds the user's account and app preferences.
type ProfileSettings struct {
	AccountEmail          *string `json:"accountEmail" firestore:"accountEmail"` // nullable
	Plan                  string  `json:"plan" firestore:"plan"`                 // "free" | "plus"
	AppLockEnabled        bool    `json:"appLockEnabled" firestore:"appLockEnabled"`
	BackupEnabled         bool    `json:"backupEnabled" firestore:"backupEnabled"`
	DefaultEntryMode      string  `json:"defaultEntryMode" firestore:"defaultEntryMode"` // "text" | "voice"
	TranscriptionLanguage string  `json:"transcriptionLanguage" firestore:"transcriptionLanguage"`
	TextToSpeechVoice     string  `json:"textToSpeechVoice" firestore:"textToSpeechVoice"`
	ReminderRhythm        string  `json:"reminderRhythm" firestore:"reminderRhythm"` // "off"|"daily"|"weekdays"|"weekends"|"custom"
	MissedYesterdayNudge  bool    `json:"missedYesterdayNudge" firestore:"missedYesterdayNudge"`
}
