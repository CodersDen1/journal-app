package gemini

import (
	"strings"
	"testing"

	"still/server/internal/model"
)

func TestGroundCitationsDropsUnknownIDs(t *testing.T) {
	byID := map[string]model.JournalEntry{
		"real": {ID: "real", CreatedAt: "2026-07-09T12:00:00Z", Text: "the entry we sent"},
	}
	claims := []citationClaim{
		{EntryID: "real", Quote: "the entry we sent"},
		{EntryID: "invented", Quote: "an entry that never existed"}, // hallucinated → dropped
		{EntryID: "real", Quote: "a repeat of the same entry"},      // duplicate → dropped
	}

	got := groundCitations(claims, byID)
	if len(got) != 1 {
		t.Fatalf("grounded %d citations, want 1 (unknown and duplicate ids must be dropped)", len(got))
	}
	if got[0].EntryID != "real" {
		t.Fatalf("kept entryId %q, want \"real\"", got[0].EntryID)
	}
	// The date must come from the stored entry, never from the model.
	if got[0].Date != "2026-07-09T12:00:00Z" {
		t.Fatalf("citation date = %q, want the stored createdAt", got[0].Date)
	}
}

func TestGroundCitationsClipsLongQuotes(t *testing.T) {
	byID := map[string]model.JournalEntry{"e": {ID: "e", CreatedAt: "2026-07-09T12:00:00Z"}}
	long := strings.Repeat("a", maxQuoteChars+80)

	got := groundCitations([]citationClaim{{EntryID: "e", Quote: long}}, byID)
	if len(got) != 1 {
		t.Fatalf("grounded %d citations, want 1", len(got))
	}
	if len(got[0].Quote) > maxQuoteChars+len("...") {
		t.Fatalf("quote kept %d chars, want it clipped to %d", len(got[0].Quote), maxQuoteChars)
	}
}

func TestGroundCitationsEmptyIsNeverNil(t *testing.T) {
	// A nil slice would serialize as JSON null; the client expects [].
	got := groundCitations(nil, map[string]model.JournalEntry{})
	if got == nil {
		t.Fatal("groundCitations(nil) = nil, want an empty slice so it serializes as []")
	}
}

func TestEntryDateFallsBackToRawTimestamp(t *testing.T) {
	if got := entryDate("2026-07-13T09:41:00Z"); got != "Monday 13 July 2026, 9:41 AM" {
		t.Fatalf("entryDate = %q, want a human date", got)
	}
	if got := entryDate("not a date"); got != "not a date" {
		t.Fatalf("entryDate(%q) = %q, want the input unchanged", "not a date", got)
	}
}
