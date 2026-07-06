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
