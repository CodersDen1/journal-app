package api

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"still/server/internal/gemini"
	"still/server/internal/model"
)

// Limits on one Ask request. The entry caps keep a long period from overrunning
// the model's context window: the most recent maxAskEntries entries in the
// period are sent, each body trimmed to maxEntryChars, and the client is told
// when that happened (AskAnswer.Truncated).
const (
	maxQuestionChars = 500
	maxAskEntries    = 120
	maxEntryChars    = 1500
	maxAskHistory    = 12 // prior turns replayed by the client (six exchanges)
)

// askRequest is the body of POST /api/ask.
//
// The period arrives as an absolute [From, To) instant range rather than being
// derived from the scope name on the server: the client knows the user's
// timezone and which week or month they stepped back to, so the days the model
// reads are exactly the days the user sees in the app. Scope only says how to
// name that period.
type askRequest struct {
	Question string             `json:"question"`
	Scope    string             `json:"scope"` // "week" | "month" | "all"
	From     string             `json:"from"`  // RFC3339, inclusive; ignored when scope is "all"
	To       string             `json:"to"`    // RFC3339, exclusive; ignored when scope is "all"
	History  []model.AskMessage `json:"history"`
}

// ask answers a question grounded in the user's own entries for a period.
func (a *API) ask(w http.ResponseWriter, r *http.Request) {
	uid, ok := a.uid(w, r)
	if !ok {
		return
	}
	if a.gemini == nil || !a.gemini.Configured() {
		writeError(w, http.StatusServiceUnavailable, "ask is not configured")
		return
	}

	var req askRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	question := strings.TrimSpace(req.Question)
	if question == "" {
		writeError(w, http.StatusBadRequest, "question is required")
		return
	}
	question = clip(question, maxQuestionChars)

	from, to, err := askWindow(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	entries, err := a.store.ListEntries(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list entries")
		return
	}

	scoped, truncated := scopeEntries(entries, from, to)
	if len(scoped) == 0 {
		// Nothing written in this period — answer honestly rather than spend a
		// model call on an empty prompt.
		writeJSON(w, http.StatusOK, model.AskAnswer{
			Answer:    emptyPeriodAnswer(req.Scope, from, to),
			Citations: []model.AskCitation{},
			FollowUps: []string{},
		})
		return
	}

	answer, err := a.gemini.Ask(r.Context(), gemini.AskQuery{
		Question:    question,
		PeriodLabel: periodLabel(req.Scope, from, to),
		Entries:     scoped,
		History:     trimHistory(req.History),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not read your journal just now")
		return
	}
	answer.Truncated = truncated
	writeJSON(w, http.StatusOK, answer)
}

// askWindow parses the requested period. Scope "all" (or absent) means the whole
// journal, signalled by two zero times.
func askWindow(req askRequest) (from, to time.Time, err error) {
	if req.Scope == "" || req.Scope == "all" {
		return time.Time{}, time.Time{}, nil
	}
	if req.Scope != "week" && req.Scope != "month" {
		return from, to, errScope
	}
	if from, err = time.Parse(time.RFC3339, req.From); err != nil {
		return from, to, errWindow
	}
	if to, err = time.Parse(time.RFC3339, req.To); err != nil {
		return from, to, errWindow
	}
	if !to.After(from) {
		return from, to, errWindow
	}
	return from, to, nil
}

// askError is a validation message safe to return to the client verbatim.
type askError string

func (e askError) Error() string { return string(e) }

const (
	errScope  = askError("scope must be week, month, or all")
	errWindow = askError("from and to must be RFC3339 timestamps with from before to")
)

// scopeEntries returns the live entries inside [from, to), oldest first, capped
// at maxAskEntries (keeping the most recent) with each body trimmed. A zero
// from and to means every entry. truncated reports whether the cap dropped any.
//
// Deleted entries are excluded; archived ones are kept — archiving tidies the
// list, it does not mean "forget this happened".
func scopeEntries(entries []model.JournalEntry, from, to time.Time) (scoped []model.JournalEntry, truncated bool) {
	all := from.IsZero() && to.IsZero()

	for _, e := range entries {
		if e.Deleted {
			continue
		}
		if strings.TrimSpace(e.Text) == "" && strings.TrimSpace(e.Transcript) == "" {
			continue
		}
		if !all {
			at, err := time.Parse(time.RFC3339, e.CreatedAt)
			if err != nil || at.Before(from) || !at.Before(to) {
				continue
			}
		}
		scoped = append(scoped, e)
	}

	sort.Slice(scoped, func(i, j int) bool { return scoped[i].CreatedAt < scoped[j].CreatedAt })

	if len(scoped) > maxAskEntries {
		scoped = scoped[len(scoped)-maxAskEntries:] // keep the most recent
		truncated = true
	}

	for i := range scoped {
		scoped[i].Text = clip(scoped[i].Text, maxEntryChars)
		scoped[i].Transcript = clip(scoped[i].Transcript, maxEntryChars)
	}
	return scoped, truncated
}

// trimHistory drops empty or unknown-role turns and keeps the most recent ones.
func trimHistory(history []model.AskMessage) []model.AskMessage {
	kept := make([]model.AskMessage, 0, len(history))
	for _, m := range history {
		if strings.TrimSpace(m.Text) == "" {
			continue
		}
		if m.Role != "user" && m.Role != "assistant" {
			continue
		}
		kept = append(kept, m)
	}
	if len(kept) > maxAskHistory {
		kept = kept[len(kept)-maxAskHistory:]
	}
	return kept
}

// periodLabel names the period the way the person would, e.g. "the week of
// 13 July 2026" or "July 2026". from carries the client's UTC offset, so the
// label lands on their local dates.
func periodLabel(scope string, from, to time.Time) string {
	switch scope {
	case "week":
		return "the week of " + from.Format("2 January 2006")
	case "month":
		return from.Format("January 2006")
	default:
		return "their whole journal"
	}
}

// emptyPeriodAnswer is the reply when the period holds nothing to read.
func emptyPeriodAnswer(scope string, from, to time.Time) string {
	if scope == "" || scope == "all" {
		return "There is nothing written down yet. Once you have a few entries, ask me anything about them."
	}
	return fmt.Sprintf(
		"You did not write anything in %s, so there is nothing for me to look back on. Try a wider period, or write something today and ask me again.",
		periodLabel(scope, from, to),
	)
}

// clip cuts s to at most n bytes, never splitting a rune, and marks the cut.
func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := s[:n]
	for len(cut) > 0 && !utf8.ValidString(cut) {
		cut = cut[:len(cut)-1]
	}
	return cut + "…"
}
